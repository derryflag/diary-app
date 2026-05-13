import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import ossClient from './oss.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.join(__dirname, '../data')
const DATA_FILE = path.join(DATA_DIR, 'diaries.json')
const ALBUM_FILE = path.join(DATA_DIR, 'album.json')

const IMAGE_DIR = path.join(DATA_DIR, 'album')
const VIDEO_DIR = path.join(DATA_DIR, 'video')
const THUMBNAIL_DIR = path.join(DATA_DIR, 'thumbnail')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors({
  origin: true,
  credentials: true
}))
app.use(express.json())

app.use(express.static(path.join(__dirname, '../dist')))

for (const dir of [DATA_DIR, IMAGE_DIR, VIDEO_DIR, THUMBNAIL_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const VIDEO_TYPES = ['.mp4', '.mov', '.avi', '.mkv', '.webm']

const getDateDir = (filename) => {
  const match = filename.match(/^(?:IMG|VID)[_-](\d{8})/i)
  if (match) return match[1]
  const digits = filename.match(/(\d{8})/)
  if (digits) return digits[1]
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const dateDir = getDateDir(file.originalname)
    const isVideoFile = VIDEO_TYPES.includes(ext)
    const baseDir = isVideoFile ? VIDEO_DIR : IMAGE_DIR
    const targetDir = path.join(baseDir, dateDir)
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    cb(null, targetDir)
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  }
})

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase()
  if (IMAGE_TYPES.includes(ext) || VIDEO_TYPES.includes(ext)) {
    cb(null, true)
  } else {
    cb(new Error('不支持的文件格式'), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }
})

const readDiaries = () => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return []
    }
    const data = fs.readFileSync(DATA_FILE, 'utf-8')
    return JSON.parse(data || '[]')
  } catch (err) {
    console.error('读取日记失败:', err)
    return []
  }
}

const writeDiaries = (diaries) => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(diaries, null, 2))
}

const readAlbum = () => {
  try {
    if (!fs.existsSync(ALBUM_FILE)) {
      return []
    }
    const data = fs.readFileSync(ALBUM_FILE, 'utf-8')
    return JSON.parse(data || '[]')
  } catch (err) {
    console.error('读取相册失败:', err)
    return []
  }
}

const writeAlbum = (album) => {
  fs.writeFileSync(ALBUM_FILE, JSON.stringify(album, null, 2))
}

const isVideo = (filename) => {
  const ext = path.extname(filename).toLowerCase()
  return VIDEO_TYPES.includes(ext)
}

const generateImageThumbnail = async (filePath, thumbPath) => {
  await sharp(filePath)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(thumbPath)
}

const generateVideoThumbnail = (filePath, thumbPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .seek(1)
      .outputOptions(['-vframes', '1'])
      .output(thumbPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

const generateCompressedVideo = (filePath, compressedPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .outputOptions([
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', 'faststart'
      ])
      .output(compressedPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

const getVideoDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err)
      resolve(metadata.format.duration || 0)
    })
  })
}

app.get('/api/diaries', (req, res) => {
  const diaries = readDiaries()
  res.json(diaries)
})

app.post('/api/diaries', (req, res) => {
  const { date, content } = req.body
  if (!date || !content) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  const diaries = readDiaries()
  const existingIndex = diaries.findIndex(d => d.date === date)

  if (existingIndex >= 0) {
    diaries[existingIndex].content = content
  } else {
    diaries.push({ date, content })
  }

  writeDiaries(diaries)
  res.json({ success: true })
})

app.delete('/api/diaries/:date', (req, res) => {
  const { date } = req.params
  let diaries = readDiaries()
  diaries = diaries.filter(d => d.date !== date)
  writeDiaries(diaries)
  res.json({ success: true })
})

app.get('/api/album', (req, res) => {
  const album = readAlbum()
  res.json(album)
})

app.post('/api/album', upload.single('media'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传文件' })
  }

  const ext = path.extname(req.file.originalname).toLowerCase()
  const dateDir = getDateDir(req.file.originalname)
  const mediaType = isVideo(req.file.originalname) ? 'video' : 'image'
  const relativePath = `${dateDir}/${req.file.filename}`
  const ossDataDir = process.env.OSS_DATA_DIR || 'data'

  try {
    const thumbDir = path.join(THUMBNAIL_DIR, dateDir)
    if (!fs.existsSync(thumbDir)) {
      fs.mkdirSync(thumbDir, { recursive: true })
    }

    const prefix = mediaType === 'video' ? 'VID_' : 'IMG_'
    const thumbFilename = `${prefix}${req.file.filename.replace(ext, '.jpg')}`
    const thumbPath = path.join(thumbDir, thumbFilename)

    if (mediaType === 'video') {
      await generateVideoThumbnail(req.file.path, thumbPath)
    } else {
      await generateImageThumbnail(req.file.path, thumbPath)
    }

    let duration = null
    let ossVideoUrl = null
    let ossVideoPath = null
    let ossCompressedUrl = null
    let ossCompressedPath = null
    let ossThumbnailUrl = null
    let ossThumbnailPath = null

    if (mediaType === 'video') {
      ossVideoPath = `${ossDataDir}/video/${dateDir}/${req.file.filename}`
      const ossVideoResult = await ossClient.put(ossVideoPath, req.file.path)
      ossVideoUrl = ossVideoResult.url

      const compressedFilename = req.file.filename.replace(ext, '_720p.mp4')
      const compressedPath = path.join(VIDEO_DIR, dateDir, compressedFilename)
      await generateCompressedVideo(req.file.path, compressedPath)
      
      ossCompressedPath = `${ossDataDir}/video/${dateDir}/${compressedFilename}`
      const ossCompressedResult = await ossClient.put(ossCompressedPath, compressedPath)
      ossCompressedUrl = ossCompressedResult.url
      
      if (fs.existsSync(compressedPath)) {
        fs.unlinkSync(compressedPath)
      }

      ossThumbnailPath = `${ossDataDir}/thumbnail/${dateDir}/${thumbFilename}`
      const ossThumbResult = await ossClient.put(ossThumbnailPath, thumbPath)
      ossThumbnailUrl = ossThumbResult.url

      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath)
      }

      duration = await getVideoDuration(req.file.path)
    } else {
      ossThumbnailPath = `${ossDataDir}/thumbnail/${dateDir}/${thumbFilename}`
      const ossThumbResult = await ossClient.put(ossThumbnailPath, thumbPath)
      ossThumbnailUrl = ossThumbResult.url

      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath)
      }
    }

    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }

    const album = readAlbum()
    const newItem = {
      id: uuidv4(),
      filename: relativePath,
      thumbnail: `${dateDir}/${thumbFilename}`,
      originalName: req.file.originalname,
      mediaType,
      uploadTime: new Date().toISOString()
    }

    if (mediaType === 'video') {
      newItem.duration = duration
      newItem.ossVideoUrl = ossVideoUrl
      newItem.ossVideoPath = ossVideoPath
      newItem.ossCompressedUrl = ossCompressedUrl
      newItem.ossCompressedPath = ossCompressedPath
      newItem.ossThumbnailUrl = ossThumbnailUrl
      newItem.ossThumbnailPath = ossThumbnailPath
    } else {
      newItem.ossThumbnailUrl = ossThumbnailUrl
      newItem.ossThumbnailPath = ossThumbnailPath
    }
    album.unshift(newItem)
    writeAlbum(album)

    res.json({ success: true, data: newItem })
  } catch (err) {
    console.error('处理文件失败:', err)
    res.status(500).json({ error: '处理文件失败' })
  }
})

app.delete('/api/album/:id', async (req, res) => {
  const { id } = req.params
  let album = readAlbum()
  const item = album.find(a => a.id === id)

  if (!item) {
    return res.status(404).json({ error: '文件不存在' })
  }

  const dateDir = item.filename.split('/')[0]

  if (item.mediaType === 'video') {
    const ossFilesToDelete = [item.ossVideoPath, item.ossCompressedPath, item.ossThumbnailPath].filter(Boolean)
    for (const ossPath of ossFilesToDelete) {
      try {
        await ossClient.delete(ossPath)
        console.log(`已删除 OSS 文件：${ossPath}`)
      } catch (err) {
        console.error(`删除 OSS 文件失败：${ossPath} - ${err.message}`)
        return res.status(500).json({
          error: `删除失败：OSS 文件删除失败（${ossPath} - ${err.message}）`,
          stage: 'oss'
        })
      }
    }
  } else {
    if (item.ossThumbnailPath) {
      try {
        await ossClient.delete(item.ossThumbnailPath)
        console.log(`已删除 OSS 缩略图：${item.ossThumbnailPath}`)
      } catch (err) {
        console.error(`删除 OSS 缩略图失败：${err.message}`)
        return res.status(500).json({
          error: `删除失败：OSS 缩略图删除失败（${err.message}）`,
          stage: 'oss_thumbnail'
        })
      }
    }
  }

  if (item.thumbnail) {
    const thumbPath = path.join(THUMBNAIL_DIR, item.thumbnail)
    if (fs.existsSync(thumbPath)) {
      try {
        fs.unlinkSync(thumbPath)
        console.log(`已删除本地缩略图：${thumbPath}`)
      } catch (err) {
        console.error(`删除本地缩略图失败：${err.message}`)
        return res.status(500).json({
          error: `删除失败：本地缩略图文件删除失败（${err.message}）`,
          stage: 'thumbnail'
        })
      }
    }
  }

  for (const dir of [VIDEO_DIR, IMAGE_DIR, THUMBNAIL_DIR]) {
    const dateDirPath = path.join(dir, dateDir)
    if (fs.existsSync(dateDirPath) && fs.readdirSync(dateDirPath).length === 0) {
      try {
        fs.rmdirSync(dateDirPath)
        console.log(`已清理空目录：${dateDirPath}`)
      } catch (err) {
        console.error(`清理空目录失败：${err.message}`)
      }
    }
  }

  album = album.filter(a => a.id !== id)
  writeAlbum(album)
  res.json({ success: true })
})

app.get('/api/album/:id/download', (req, res) => {
  const { id } = req.params
  const album = readAlbum()
  const item = album.find(a => a.id === id)

  if (!item) {
    return res.status(404).json({ error: '文件不存在' })
  }

  const downloadUrl = item.mediaType === 'video'
    ? (item.ossCompressedUrl || item.ossVideoUrl)
    : (item.ossThumbnailUrl)

  if (!downloadUrl) {
    return res.status(404).json({ error: '文件不存在' })
  }

  res.json({ downloadUrl })
})

app.use('/uploads', express.static(IMAGE_DIR))
app.use('/thumbnails', express.static(THUMBNAIL_DIR))
app.use('/videos', express.static(VIDEO_DIR))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务已启动: http://0.0.0.0:${PORT}`)
})
