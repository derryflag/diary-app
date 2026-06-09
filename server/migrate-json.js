// 从 diaries.json 迁移数据到 SQLite 数据库
// 使用方法: node server/migrate-json.js

import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.join(__dirname, '../data')
const DATA_FILE = path.join(DATA_DIR, 'diaries.json')
const DB_FILE = path.join(DATA_DIR, 'diary.db')

if (!fs.existsSync(DATA_FILE)) {
  console.error('错误: 未找到 diaries.json')
  process.exit(1)
}

const db = new Database(DB_FILE)
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS diaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    diary_date TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, diary_date)
  );
`)

// 确保 tmpuser 存在
db.prepare("INSERT OR IGNORE INTO users (username) VALUES ('tmpuser')").run()

// 读取并迁移数据
const data = fs.readFileSync(DATA_FILE, 'utf-8')
const diaries = JSON.parse(data || '[]')

if (diaries.length === 0) {
  console.log('diaries.json 为空，无需迁移')
  process.exit(0)
}

const insert = db.prepare(`
  INSERT OR REPLACE INTO diaries (user_id, diary_date, content, created_at, updated_at)
  VALUES ('tmpuser', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`)

const insertMany = db.transaction((diaries) => {
  let updatedCount = 0
  for (const d of diaries) {
    const content = (d.content || '').replace(/^[\s\n]+|[\s\n]+$/g, '')
    insert.run(d.date, content)
    updatedCount++
  }
  return updatedCount
})

const count = insertMany(diaries)
console.log(`成功迁移 ${count} 条日记到 diary.db`)

// 备份原文件
const backupPath = DATA_FILE + '.backup'
fs.renameSync(DATA_FILE, backupPath)
console.log(`原 diaries.json 已备份为 diaries.json.backup`)
console.log('如需回滚，可手动恢复备份文件')
