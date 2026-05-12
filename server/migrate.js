import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.join(__dirname, '../data')
const ALBUM_FILE = path.join(DATA_DIR, 'album.json')
const IMAGE_DIR = path.join(DATA_DIR, 'album')
const THUMBNAIL_DIR = path.join(DATA_DIR, 'thumbnail')

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

const readAlbum = () => {
  try {
    if (!fs.existsSync(ALBUM_FILE)) return []
    const data = fs.readFileSync(ALBUM_FILE, 'utf-8')
    return JSON.parse(data || '[]')
  } catch {
    return []
  }
}

const writeAlbum = (album) => {
  fs.writeFileSync(ALBUM_FILE, JSON.stringify(album, null, 2))
}

const walkDir = (dir) => {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath))
    } else {
      results.push(fullPath)
    }
  }
  return results
}

const migrate = async () => {
  console.log('开始迁移历史图片...\n')

  const imageFiles = walkDir(IMAGE_DIR).filter(f => IMAGE_EXT.has(path.extname(f).toLowerCase()))
  console.log(`找到 ${imageFiles.length} 个图片文件\n`)

  const album = readAlbum()
  const existingFiles = new Set(album.map(item => item.filename))
  
  let newCount = 0
  let skippedCount = 0
  let thumbGenerated = 0

  for (const filePath of imageFiles) {
    const relativePath = path.relative(IMAGE_DIR, filePath)
    const dateDir = path.dirname(relativePath)
    const filename = path.basename(filePath)
    const thumbFilename = filename.replace(path.extname(filename), '.jpg')
    const thumbDir = path.join(THUMBNAIL_DIR, dateDir)
    const thumbPath = path.join(thumbDir, thumbFilename)

    if (!fs.existsSync(thumbPath)) {
      if (!fs.existsSync(thumbDir)) {
        fs.mkdirSync(thumbDir, { recursive: true })
      }
      try {
        await sharp(filePath)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(thumbPath)
        thumbGenerated++
      } catch (err) {
        console.error(`  生成缩略图失败: ${filename} - ${err.message}`)
        continue
      }
    } else {
      skippedCount++
    }

    if (!existingFiles.has(relativePath)) {
      const newItem = {
        id: uuidv4(),
        filename: relativePath,
        thumbnail: `${dateDir}/${thumbFilename}`,
        originalName: filename,
        mediaType: 'image',
        uploadTime: new Date().toISOString()
      }
      album.unshift(newItem)
      newCount++
    }
  }

  writeAlbum(album)

  console.log(`\n迁移完成！`)
  console.log(`  新增记录: ${newCount}`)
  console.log(`  生成缩略图: ${thumbGenerated}`)
  console.log(`  跳过(缩略图已存在): ${skippedCount}`)
}

migrate()
