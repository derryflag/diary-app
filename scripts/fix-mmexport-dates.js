#!/usr/bin/env node
/**
 * 修复 album.json 中 mmexport 文件的日期分类错误
 *
 * 用法: node scripts/fix-mmexport-dates.js [--dry-run]
 *
 * --dry-run: 只输出将要修改的文件，不实际修改 album.json
 * 不加参数: 直接修改 album.json 并输出修改结果
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ALBUM_FILE = path.join(__dirname, '../data/album.json')

function getDateDir(filename) {
  const match = filename.match(/^(?:IMG|VID)[_-](\d{8})/i)
  if (match) return match[1]
  const mmexportMatch = filename.match(/mmexport(\d{13})/i)
  if (mmexportMatch) {
    const timestamp = parseInt(mmexportMatch[1])
    const date = new Date(timestamp)
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  }
  const digits = filename.match(/(\d{8})/)
  if (digits) return digits[1]
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
}

function fixAlbum() {
  if (!fs.existsSync(ALBUM_FILE)) {
    console.error('album.json 不存在:', ALBUM_FILE)
    process.exit(1)
  }

  const album = JSON.parse(fs.readFileSync(ALBUM_FILE, 'utf-8'))
  const dryRun = process.argv.includes('--dry-run')

  console.log(`共 ${album.length} 条记录，开始扫描...`)

  let fixedCount = 0
  const changes = []

  for (const item of album) {
    if (!item.filename || !item.originalName) continue

    if (!item.originalName.match(/mmexport\d{13}/i)) continue

    const currentDir = item.filename.split('/')[0]
    const correctDir = getDateDir(item.originalName)

    if (currentDir !== correctDir) {
      const oldPath = item.filename
      const newPath = item.filename.replace(currentDir + '/', correctDir + '/')

      if (item.thumbnail) {
        item.thumbnail = item.thumbnail.replace(currentDir + '/', correctDir + '/')
      }

      item.filename = newPath

      changes.push({
        originalName: item.originalName,
        oldDir: currentDir,
        newDir: correctDir,
        oldFilename: oldPath,
        newFilename: newPath
      })

      fixedCount++
    }
  }

  if (fixedCount === 0) {
    console.log('没有发现需要修复的 mmexport 文件。')
    return
  }

  console.log(`\n发现 ${fixedCount} 条需要修复的记录：\n`)
  for (const c of changes) {
    console.log(`  ${c.originalName}`)
    console.log(`    ${c.oldDir} → ${c.newDir}`)
    console.log(`    ${c.oldFilename}`)
    console.log(`    ${c.newFilename}`)
    console.log('')
  }

  if (dryRun) {
    console.log('\n【Dry Run 模式】未修改 album.json')
    console.log('请确认无误后，运行以下命令执行修复：')
    console.log('  node scripts/fix-mmexport-dates.js')
  } else {
    fs.writeFileSync(ALBUM_FILE, JSON.stringify(album, null, 2))
    console.log(`\n已修复 ${fixedCount} 条记录，album.json 已更新。`)
  }
}

fixAlbum()
