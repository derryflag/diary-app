#!/usr/bin/env node
/**
 * 修复 album.json 中 mmexport 文件的日期分类错误
 *
 * 用法: node scripts/fix-mmexport-dates.js [--dry-run]
 *
 * --dry-run: 只输出将要修改的文件，不实际修改 album.json 和移动文件
 * 不加参数: 直接修改 album.json 并移动磁盘上的文件
 *
 * 逻辑: 对所有 mmexport 文件，从 originalName 中提取时间戳重新计算正确日期，
 *       检查所有路径（filename、thumbnail、OSS路径）是否包含正确日期目录，
 *       不匹配则统一修正。
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ALBUM_FILE = path.join(__dirname, '../data/album.json')
const DATA_DIR = path.join(__dirname, '../data')
const IMAGE_DIR = path.join(DATA_DIR, 'album')
const VIDEO_DIR = path.join(DATA_DIR, 'video')
const THUMBNAIL_DIR = path.join(DATA_DIR, 'thumbnail')

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

function moveFile(oldPath, newPath) {
  if (!fs.existsSync(oldPath)) return false
  const newDir = path.dirname(newPath)
  if (!fs.existsSync(newDir)) {
    fs.mkdirSync(newDir, { recursive: true })
  }
  fs.renameSync(oldPath, newPath)
  return true
}

function extractOldDir(filePath) {
  if (!filePath) return null
  const parts = filePath.split('/mmexport')
  if (parts.length > 1) {
    const lastSlash = parts[0].lastIndexOf('/')
    if (lastSlash >= 0) {
      return parts[0].substring(lastSlash + 1)
    }
  }
  const slashIndex = filePath.indexOf('/')
  if (slashIndex >= 0) {
    return filePath.substring(0, slashIndex)
  }
  return null
}

function fixAlbum() {
  if (!fs.existsSync(ALBUM_FILE)) {
    console.error('album.json 不存在:', ALBUM_FILE)
    process.exit(1)
  }

  const album = JSON.parse(fs.readFileSync(ALBUM_FILE, 'utf-8'))
  const dryRun = process.argv.includes('--dry-run')

  console.log(`共 ${album.length} 条记录，开始扫描所有 mmexport 文件...`)

  let fixedCount = 0
  const changes = []

  for (const item of album) {
    if (!item.filename || !item.originalName) continue
    if (!item.originalName.match(/mmexport\d{13}/i)) continue

    const correctDir = getDateDir(item.originalName)

    const pathsToCheck = [
      { key: 'filename', value: item.filename },
      { key: 'thumbnail', value: item.thumbnail },
      { key: 'ossVideoPath', value: item.ossVideoPath },
      { key: 'ossCompressedPath', value: item.ossCompressedPath },
      { key: 'ossThumbnailPath', value: item.ossThumbnailPath },
      { key: 'ossVideoUrl', value: item.ossVideoUrl },
      { key: 'ossCompressedUrl', value: item.ossCompressedUrl },
      { key: 'ossThumbnailUrl', value: item.ossThumbnailUrl }
    ]

    const oldDir = extractOldDir(item.filename)
    const mismatchedPaths = pathsToCheck.filter(p => {
      if (!p.value) return false
      const pathWithoutLeading = p.value.startsWith(`${correctDir}/`) ? p.value : p.value
      return !pathWithoutLeading.includes(`/${correctDir}/`) && !pathWithoutLeading.startsWith(`${correctDir}/`)
    })

    if (mismatchedPaths.length === 0) continue

    const changesForItem = {
      originalName: item.originalName,
      mediaType: item.mediaType,
      oldDir: oldDir,
      newDir: correctDir,
      movedFiles: [],
      updatedPaths: []
    }

    if (!dryRun) {
      const newFilename = item.filename.replace(`${oldDir}/`, `${correctDir}/`)
      const newThumbnail = item.thumbnail ? item.thumbnail.replace(`${oldDir}/`, `${correctDir}/`) : null

      if (item.mediaType === 'video') {
        const oldVideoPath = path.join(VIDEO_DIR, item.filename)
        const newVideoPath = path.join(VIDEO_DIR, newFilename)
        if (moveFile(oldVideoPath, newVideoPath)) {
          changesForItem.movedFiles.push(`${oldVideoPath} → ${newVideoPath}`)
        }
      } else {
        const oldImagePath = path.join(IMAGE_DIR, item.filename)
        const newImagePath = path.join(IMAGE_DIR, newFilename)
        if (moveFile(oldImagePath, newImagePath)) {
          changesForItem.movedFiles.push(`${oldImagePath} → ${newImagePath}`)
        }
      }

      if (item.thumbnail && newThumbnail) {
        const oldThumbPath = path.join(THUMBNAIL_DIR, item.thumbnail)
        const newThumbPath = path.join(THUMBNAIL_DIR, newThumbnail)
        if (moveFile(oldThumbPath, newThumbPath)) {
          changesForItem.movedFiles.push(`${oldThumbPath} → ${newThumbPath}`)
        }
      }

      item.filename = newFilename
      if (newThumbnail) {
        item.thumbnail = newThumbnail
      }

      for (const p of pathsToCheck) {
        if (p.value && !p.value.includes(`/${correctDir}/`)) {
          const oldValue = p.value
          item[p.key] = p.value.replace(`${oldDir}/`, `${correctDir}/`)
          changesForItem.updatedPaths.push(`${p.key}: ${oldValue} → ${item[p.key]}`)
        }
      }
    } else {
      for (const p of mismatchedPaths) {
        changesForItem.updatedPaths.push(`${p.key}: ${p.value} → ${p.value.replace(`${oldDir}/`, `${correctDir}/`)}`)
      }
    }

    changes.push(changesForItem)
    fixedCount++
  }

  if (fixedCount === 0) {
    console.log('所有 mmexport 文件的路径都已正确，无需修复。')
    return
  }

  console.log(`\n发现 ${fixedCount} 条需要修复的记录：\n`)
  for (const c of changes) {
    console.log(`  ${c.originalName} [${c.mediaType}]`)
    console.log(`    旧目录: ${c.oldDir} → 新目录: ${c.newDir}`)
    if (!dryRun && c.movedFiles.length > 0) {
      console.log('    已移动文件:')
      for (const mf of c.movedFiles) {
        console.log(`      ✓ ${mf}`)
      }
    } else if (dryRun) {
      if (c.mediaType === 'video') {
        console.log(`    将移动: ${path.join(VIDEO_DIR, c.originalName)}`)
      } else {
        console.log(`    将移动: ${path.join(IMAGE_DIR, c.originalName)}`)
      }
      if (c.mediaType === 'video' || c.mediaType === 'image') {
        console.log(`    将移动: ${path.join(THUMBNAIL_DIR, c.originalName.replace('mmexport', 'VID_mmexport').replace(/\.mp4$/, '.jpg'))}`)
      }
    }
    console.log('    更新路径:')
    for (const up of c.updatedPaths) {
      console.log(`      ✓ ${up}`)
    }
    console.log('')
  }

  if (dryRun) {
    console.log('\n【Dry Run 模式】未修改任何文件')
    console.log('请确认无误后，运行以下命令执行修复：')
    console.log('  node scripts/fix-mmexport-dates.js')
  } else {
    fs.writeFileSync(ALBUM_FILE, JSON.stringify(album, null, 2))
    console.log(`\n已修复 ${fixedCount} 条记录，album.json 已更新，文件已移动。`)
  }
}

fixAlbum()
