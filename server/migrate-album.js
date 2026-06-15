#!/usr/bin/env node
// 从 album.json 迁移数据到 SQLite 数据库
// 使用方法: node server/migrate-album.js

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.join(__dirname, '../data')
const ALBUM_FILE = path.join(DATA_DIR, 'album.json')
const DB_FILE = path.join(DATA_DIR, 'diary.db')

const db = new Database(DB_FILE)
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')

// 确保 album 表存在
db.exec(`
  CREATE TABLE IF NOT EXISTS album (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    thumbnail TEXT,
    media_type TEXT NOT NULL,
    upload_time DATETIME NOT NULL,
    file_size INTEGER,
    duration INTEGER,
    title TEXT,
    oss_path TEXT,
    oss_compressed_path TEXT,
    oss_thumbnail_path TEXT,
    oss_url TEXT,
    oss_compressed_url TEXT,
    oss_thumbnail_url TEXT
  );
`)

// 确保 tmpuser 存在
const tmpUser = db.prepare('SELECT id FROM users WHERE username = ?').get('tmpuser')
if (!tmpUser) {
  db.prepare('INSERT INTO users (username) VALUES (?)').run('tmpuser')
  console.log('已创建临时用户: tmpuser')
}

// 读取 album.json
if (!fs.existsSync(ALBUM_FILE)) {
  console.log('未找到 album.json，跳过迁移')
  process.exit(0)
}

const data = fs.readFileSync(ALBUM_FILE, 'utf-8')
const albumData = JSON.parse(data || '[]')

if (!Array.isArray(albumData) || albumData.length === 0) {
  console.log('album.json 为空，跳过迁移')
  process.exit(0)
}

console.log(`找到 ${albumData.length} 条相册记录，开始迁移...`)

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO album (
    id, user_id, filename, thumbnail, media_type, upload_time,
    file_size, duration, title,
    oss_path, oss_compressed_path, oss_thumbnail_path,
    oss_url, oss_compressed_url, oss_thumbnail_url
  ) VALUES (
    @id, 'tmpuser', @filename, @thumbnail, @mediaType, @uploadTime,
    @fileSize, @duration, @title,
    @ossPath, @ossCompressedPath, @ossThumbnailPath,
    @ossUrl, @ossCompressedUrl, @ossThumbnailUrl
  )
`)

const insertMany = db.transaction((items) => {
  for (const item of items) {
    insertStmt.run({
      id: item.id,
      filename: item.filename || '',
      thumbnail: item.thumbnail || null,
      mediaType: item.mediaType || 'image',
      uploadTime: item.uploadTime || new Date().toISOString(),
      fileSize: item.fileSize || null,
      duration: item.duration || null,
      title: item.title || null,
      ossPath: item.ossPath || null,
      ossCompressedPath: item.ossCompressedPath || null,
      ossThumbnailPath: item.ossThumbnailPath || null,
      ossUrl: item.ossUrl || null,
      ossCompressedUrl: item.ossCompressedUrl || null,
      ossThumbnailUrl: item.ossThumbnailUrl || null
    })
  }
})

insertMany(albumData)

console.log(`成功迁移 ${albumData.length} 条记录`)

// 备份原文件
fs.renameSync(ALBUM_FILE, `${ALBUM_FILE}.backup`)
console.log('原文件已备份为: album.json.backup')

db.close()
console.log('迁移完成')
