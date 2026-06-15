import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'url'
import ossClient, { ossConfig, publicClient } from '../oss.js'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

const DATA_DIR = path.join(__dirname, '../../data')
const IMAGE_DIR = path.join(DATA_DIR, 'album')
const VIDEO_DIR = path.join(DATA_DIR, 'video')
const THUMBNAIL_DIR = path.join(DATA_DIR, 'thumbnail')
const PROCESSING_DIR = path.join(DATA_DIR, 'processing')

const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const VIDEO_TYPES = ['.mp4', '.mov', '.avi', '.mkv', '.webm']

const processingTasks = new Map()

const getDateDir = (filename) => {
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

const isVideoFile = (filename) => {
  const ext = path.extname(filename).toLowerCase()
  return VIDEO_TYPES.includes(ext)
}

// Map DB row to frontend-expected format
const mapAlbumItem = (row) => ({
  id: row.id,
  filename: row.filename,
  thumbnail: row.thumbnail,
  mediaType: row.media_type,
  uploadTime: row.upload_time,
  fileSize: row.file_size,
  duration: row.duration,
  title: row.title,
  // OSS fields (frontend expects camelCase)
  ossPath: row.oss_path,
  ossUrl: row.oss_url,
  ossCompressedPath: row.oss_compressed_path,
  ossCompressedUrl: row.oss_compressed_url,
  ossThumbnailPath: row.oss_thumbnail_path,
  ossThumbnailUrl: row.oss_thumbnail_url,
  // Legacy field for backward compatibility
  originalName: row.filename?.split('/').pop()
})

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

// --- Routes ---

router.post('/api/oss/sign', authMiddleware, async (req, res) => {
  try {
    const { filename, contentType, fileSize } = req.body
    if (!filename) {
      return res.status(400).json({ error: '缺少文件名' })
    }

    const dateDir = getDateDir(filename)
    const mediaType = isVideoFile(filename) ? 'video' : 'image'
    const ossDataDir = ossConfig.dataDir

    const ossPath = `${ossDataDir}/${mediaType === 'video' ? 'video' : 'thumbnail'}/${dateDir}/${filename}`
    const url = publicClient.signatureUrl(ossPath, {
      method: 'PUT',
      expires: 300,
      contentType,
      'Content-Type': contentType
    })

    res.json({
      success: true,
      data: {
        uploadUrl: url,
        ossPath,
        dateDir,
        mediaType,
        endpoint: ossConfig.publicEndpoint
      }
    })
  } catch (err) {
    console.error('生成签名失败:', err)
    res.status(500).json({ error: '生成签名失败' })
  }
})

// Local file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const dateDir = getDateDir(file.originalname)
    const isVid = isVideoFile(file.originalname)
    const baseDir = isVid ? VIDEO_DIR : IMAGE_DIR
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
  limits: { fileSize: 300 * 1024 * 1024 }
})

router.post('/api/album/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ error: '缺少文件' })
    }

    const taskId = uuidv4()
    const dateDir = getDateDir(file.originalname)
    const isVid = isVideoFile(file.originalname)

    processingTasks.set(taskId, {
      id: taskId,
      status: 'processing',
      progress: 0,
      message: '正在处理...',
      filePath: file.path,
      originalName: file.originalname,
      dateDir,
      mediaType: isVid ? 'video' : 'image',
      createdAt: new Date().toISOString()
    })

    processMediaAsync(taskId, file.path, file.originalname, dateDir, isVid).catch(err => {
      console.error(`异步处理任务 ${taskId} 失败:`, err)
      const task = processingTasks.get(taskId)
      if (task) {
        task.status = 'failed'
        task.error = err.message
      }
    })

    res.json({ success: true, taskId })
  } catch (err) {
    console.error('上传失败:', err)
    res.status(500).json({ error: '上传失败' })
  }
})

// OSS upload confirm (video processing)
router.post('/api/album/confirm', authMiddleware, async (req, res) => {
  const { ossPath, originalName, dateDir, mediaType, fileSize } = req.body
  if (!ossPath || !originalName) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  const taskId = uuidv4()
  processingTasks.set(taskId, {
    id: taskId,
    status: 'processing',
    progress: 0,
    message: '正在处理...',
    ossPath,
    originalName,
    dateDir,
    mediaType,
    createdAt: new Date().toISOString()
  })

  processVideoAsync(taskId, ossPath, originalName, dateDir).catch(err => {
    console.error(`异步处理任务 ${taskId} 失败:`, err)
    const task = processingTasks.get(taskId)
    if (task) {
      task.status = 'failed'
      task.error = err.message
    }
  })

  res.json({ success: true, taskId })
})

// Get album
router.get('/api/album', authMiddleware, (req, res) => {
  const stmt = db.prepare('SELECT * FROM album ORDER BY upload_time DESC')
  const rows = stmt.all()
  res.json(rows.map(mapAlbumItem))
})

// Task status
router.get('/api/album/:taskId/status', authMiddleware, (req, res) => {
  const { taskId } = req.params
  const task = processingTasks.get(taskId)
  if (!task) {
    return res.status(404).json({ error: '任务不存在' })
  }

  if (task.status === 'completed') {
    const mappedData = mapAlbumItem(task.data)
    res.json({
      success: true,
      status: 'completed',
      progress: 100,
      message: '处理完成',
      data: mappedData
    })
    setTimeout(() => processingTasks.delete(taskId), 60000)
  } else {
    res.json({
      success: true,
      status: task.status,
      progress: task.progress,
      message: task.message
    })
  }
})

// Process media (local upload)
const processMediaAsync = async (taskId, filePath, originalName, dateDir, isVid) => {
  const task = processingTasks.get(taskId)
  if (!task) return

  const ext = path.extname(originalName).toLowerCase()

  try {
    if (isVid) {
      task.progress = 10
      task.message = '正在生成缩略图...'
      const prefix = 'VID_'
      const thumbFilename = `${prefix}${originalName.replace(ext, '.jpg')}`
      const thumbDir = path.join(THUMBNAIL_DIR, dateDir)
      if (!fs.existsSync(thumbDir)) {
        fs.mkdirSync(thumbDir, { recursive: true })
      }
      const thumbPath = path.join(thumbDir, thumbFilename)
      await generateVideoThumbnail(filePath, thumbPath)

      task.progress = 50
      task.message = '正在压缩视频...'
      const compressedFilename = originalName.replace(ext, '_720p.mp4')
      const compressedPath = path.join(PROCESSING_DIR, compressedFilename)
      await generateCompressedVideo(filePath, compressedPath)

      const videoDir = path.join(VIDEO_DIR, dateDir)
      if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true })
      }
      const finalVideoPath = path.join(videoDir, compressedFilename)
      fs.renameSync(compressedPath, finalVideoPath)

      task.progress = 90
      task.message = '正在获取视频时长...'
      const duration = await getVideoDuration(filePath)

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }

      task.progress = 95
      task.message = '正在保存记录...'
      const newItem = {
        id: uuidv4(),
        user_id: 'tmpuser',
        filename: `${dateDir}/${compressedFilename}`,
        thumbnail: `${dateDir}/${thumbFilename}`,
        media_type: 'video',
        upload_time: new Date().toISOString(),
        duration
      }

      const insertStmt = db.prepare(`
        INSERT INTO album (id, user_id, filename, thumbnail, media_type, upload_time, duration)
        VALUES (@id, @user_id, @filename, @thumbnail, @media_type, @upload_time, @duration)
      `)
      insertStmt.run({
        id: newItem.id,
        user_id: newItem.user_id,
        filename: newItem.filename,
        thumbnail: newItem.thumbnail,
        media_type: newItem.media_type,
        upload_time: newItem.upload_time,
        duration: newItem.duration
      })

      task.status = 'completed'
      task.progress = 100
      task.message = '处理完成'
      task.data = newItem
      console.log(`[${taskId}] 视频处理完成: ${originalName}`)
    } else {
      task.progress = 10
      task.message = '正在生成缩略图...'
      const prefix = 'IMG_'
      const thumbFilename = `${prefix}${originalName.replace(ext, '.jpg')}`
      const thumbDir = path.join(THUMBNAIL_DIR, dateDir)
      if (!fs.existsSync(thumbDir)) {
        fs.mkdirSync(thumbDir, { recursive: true })
      }
      const thumbPath = path.join(thumbDir, thumbFilename)
      await generateImageThumbnail(filePath, thumbPath)

      const albumDir = path.join(IMAGE_DIR, dateDir)
      if (!fs.existsSync(albumDir)) {
        fs.mkdirSync(albumDir, { recursive: true })
      }
      const finalImagePath = path.join(albumDir, originalName)
      fs.renameSync(filePath, finalImagePath)

      task.progress = 95
      task.message = '正在保存记录...'
      const newItem = {
        id: uuidv4(),
        user_id: 'tmpuser',
        filename: `${dateDir}/${originalName}`,
        thumbnail: `${dateDir}/${thumbFilename}`,
        media_type: 'image',
        upload_time: new Date().toISOString()
      }

      const insertStmt = db.prepare(`
        INSERT INTO album (id, user_id, filename, thumbnail, media_type, upload_time)
        VALUES (@id, @user_id, @filename, @thumbnail, @media_type, @upload_time)
      `)
      insertStmt.run({
        id: newItem.id,
        user_id: newItem.user_id,
        filename: newItem.filename,
        thumbnail: newItem.thumbnail,
        media_type: newItem.media_type,
        upload_time: newItem.upload_time
      })

      task.status = 'completed'
      task.progress = 100
      task.message = '处理完成'
      task.data = newItem
      console.log(`[${taskId}] 图片处理完成: ${originalName}`)
    }
  } catch (err) {
    console.error(`[${taskId}] 处理失败:`, err)
    task.status = 'failed'
    task.error = err.message
    task.message = `处理失败：${err.message}`
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch (e) {}
    }
  }
}

// Process video from OSS upload
const processVideoAsync = async (taskId, ossPath, originalName, dateDir) => {
  const task = processingTasks.get(taskId)
  if (!task) return

  const ossDataDir = ossConfig.dataDir
  const ext = path.extname(originalName).toLowerCase()
  const ossEndpoint = ossConfig.endpoint || 'unknown'
  const downloadPath = path.join(PROCESSING_DIR, originalName)

  try {
    task.progress = 10
    task.message = `正在下载视频... [${ossEndpoint}]`
    console.log(`[${taskId}] 下载视频: ${ossPath}`)
    await ossClient.get(ossPath, downloadPath)

    task.progress = 30
    task.message = '正在生成缩略图...'
    const prefix = 'VID_'
    const thumbFilename = `${prefix}${originalName.replace(ext, '.jpg')}`
    const thumbDir = path.join(THUMBNAIL_DIR, dateDir)
    if (!fs.existsSync(thumbDir)) {
      fs.mkdirSync(thumbDir, { recursive: true })
    }
    const thumbPath = path.join(thumbDir, thumbFilename)
    await generateVideoThumbnail(downloadPath, thumbPath)

    task.progress = 40
    task.message = `正在上传缩略图... [${ossEndpoint}]`
    const ossThumbnailPath = `${ossDataDir}/thumbnail/${dateDir}/${thumbFilename}`
    await ossClient.put(ossThumbnailPath, thumbPath)
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath)
    }

    task.progress = 50
    task.message = '正在压缩视频...'
    const compressedFilename = originalName.replace(ext, '_720p.mp4')
    const compressedPath = path.join(PROCESSING_DIR, compressedFilename)
    await generateCompressedVideo(downloadPath, compressedPath)

    task.progress = 80
    task.message = `正在上传压缩视频... [${ossEndpoint}]`
    const ossCompressedPath = `${ossDataDir}/video/${dateDir}/${compressedFilename}`
    await ossClient.put(ossCompressedPath, compressedPath)
    if (fs.existsSync(compressedPath)) {
      fs.unlinkSync(compressedPath)
    }

    task.progress = 90
    task.message = '正在获取视频时长...'
    const duration = await getVideoDuration(downloadPath)

    if (fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath)
    }

    task.progress = 95
    task.message = '正在保存记录...'
    const newItem = {
      id: uuidv4(),
      user_id: 'tmpuser',
      filename: `${dateDir}/${originalName}`,
      thumbnail: `${dateDir}/${thumbFilename}`,
      media_type: 'video',
      upload_time: new Date().toISOString(),
      duration,
      oss_video_url: `https://${ossConfig.bucket}.${ossConfig.publicEndpoint}/${ossPath}`,
      oss_video_path: ossPath,
      oss_compressed_url: `https://${ossConfig.bucket}.${ossConfig.publicEndpoint}/${ossCompressedPath}`,
      oss_compressed_path: ossCompressedPath,
      oss_thumbnail_url: `https://${ossConfig.bucket}.${ossConfig.publicEndpoint}/${ossThumbnailPath}`,
      oss_thumbnail_path: ossThumbnailPath
    }

    const insertStmt = db.prepare(`
      INSERT INTO album (id, user_id, filename, thumbnail, media_type, upload_time, duration,
        oss_url, oss_path, oss_compressed_url, oss_compressed_path, oss_thumbnail_url, oss_thumbnail_path)
      VALUES (@id, @user_id, @filename, @thumbnail, @media_type, @upload_time, @duration,
        @oss_url, @oss_path, @oss_compressed_url, @oss_compressed_path, @oss_thumbnail_url, @oss_thumbnail_path)
    `)
    insertStmt.run({
      id: newItem.id,
      user_id: newItem.user_id,
      filename: newItem.filename,
      thumbnail: newItem.thumbnail,
      media_type: newItem.media_type,
      upload_time: newItem.upload_time,
      duration: newItem.duration,
      oss_url: newItem.oss_video_url,
      oss_path: newItem.oss_video_path,
      oss_compressed_url: newItem.oss_compressed_url,
      oss_compressed_path: newItem.oss_compressed_path,
      oss_thumbnail_url: newItem.oss_thumbnail_url,
      oss_thumbnail_path: newItem.oss_thumbnail_path
    })

    task.status = 'completed'
    task.progress = 100
    task.message = '处理完成'
    task.data = newItem
    console.log(`[${taskId}] 视频处理完成: ${originalName}`)
  } catch (err) {
    console.error(`[${taskId}] 处理失败:`, err)
    task.status = 'failed'
    task.error = err.message
    task.message = `处理失败：${err.message}`
    if (fs.existsSync(downloadPath)) {
      try {
        fs.unlinkSync(downloadPath)
      } catch (e) {}
    }
  }
}

// Process image from OSS upload
const processImageAsync = async (taskId, ossPath, originalName, dateDir) => {
  const task = processingTasks.get(taskId)
  if (!task) return

  const ossDataDir = ossConfig.dataDir
  const ext = path.extname(originalName).toLowerCase()
  const ossEndpoint = ossConfig.endpoint || 'unknown'
  const downloadPath = path.join(PROCESSING_DIR, originalName)

  try {
    task.progress = 10
    task.message = '正在生成缩略图...'
    const prefix = 'IMG_'
    const thumbFilename = `${prefix}${originalName.replace(ext, '.jpg')}`
    const thumbDir = path.join(THUMBNAIL_DIR, dateDir)
    if (!fs.existsSync(thumbDir)) {
      fs.mkdirSync(thumbDir, { recursive: true })
    }
    const thumbPath = path.join(thumbDir, thumbFilename)
    await generateImageThumbnail(downloadPath, thumbPath)

    task.progress = 40
    task.message = `正在上传缩略图... [${ossEndpoint}]`
    const ossThumbnailPath = `${ossDataDir}/thumbnail/${dateDir}/${thumbFilename}`
    await ossClient.put(ossThumbnailPath, thumbPath)
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath)
    }
    if (fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath)
    }

    const newItem = {
      id: uuidv4(),
      user_id: 'tmpuser',
      filename: `${dateDir}/${originalName}`,
      thumbnail: `${dateDir}/${thumbFilename}`,
      media_type: 'image',
      upload_time: new Date().toISOString(),
      oss_url: `https://${ossConfig.bucket}.${ossConfig.publicEndpoint}/${ossPath}`,
      oss_path: ossPath,
      oss_thumbnail_url: `https://${ossConfig.bucket}.${ossConfig.publicEndpoint}/${ossThumbnailPath}`,
      oss_thumbnail_path: ossThumbnailPath
    }

    const insertStmt = db.prepare(`
      INSERT INTO album (id, user_id, filename, thumbnail, media_type, upload_time,
        oss_url, oss_path, oss_thumbnail_url, oss_thumbnail_path)
      VALUES (@id, @user_id, @filename, @thumbnail, @media_type, @upload_time,
        @oss_url, @oss_path, @oss_thumbnail_url, @oss_thumbnail_path)
    `)
    insertStmt.run({
      id: newItem.id,
      user_id: newItem.user_id,
      filename: newItem.filename,
      thumbnail: newItem.thumbnail,
      media_type: newItem.media_type,
      upload_time: newItem.upload_time,
      oss_url: newItem.oss_url,
      oss_path: newItem.oss_path,
      oss_thumbnail_url: newItem.oss_thumbnail_url,
      oss_thumbnail_path: newItem.oss_thumbnail_path
    })

    task.status = 'completed'
    task.progress = 100
    task.message = '处理完成'
    task.data = newItem
    console.log(`[${taskId}] 图片处理完成: ${originalName}`)
  } catch (err) {
    console.error(`[${taskId}] 处理失败:`, err)
    task.status = 'failed'
    task.error = err.message
    task.message = `处理失败：${err.message}`
    if (fs.existsSync(downloadPath)) {
      try {
        fs.unlinkSync(downloadPath)
      } catch (e) {}
    }
  }
}

// Delete
router.delete('/api/album/:id', authMiddleware, async (req, res) => {
  const { id } = req.params
  const item = db.prepare('SELECT * FROM album WHERE id = ?').get(id)

  if (!item) {
    return res.status(404).json({ error: '文件不存在' })
  }

  const dateDir = item.filename.split('/')[0]

  if (item.media_type === 'video') {
    const videoPath = path.join(VIDEO_DIR, item.filename)
    if (fs.existsSync(videoPath)) {
      try {
        fs.unlinkSync(videoPath)
        console.log(`已删除本地视频：${videoPath}`)
      } catch (err) {
        console.error(`删除本地视频失败：${err.message}`)
        return res.status(500).json({ error: '删除失败', stage: 'video' })
      }
    }

    const ossFilesToDelete = [item.oss_path, item.oss_compressed_path, item.oss_thumbnail_path].filter(Boolean)
    for (const ossPath of ossFilesToDelete) {
      try {
        await ossClient.delete(ossPath)
        console.log(`已删除 OSS 文件：${ossPath}`)
      } catch (err) {
        console.error(`删除 OSS 文件失败：${ossPath} - ${err.message}`)
      }
    }
  } else {
    if (item.filename) {
      const originalPath = path.join(IMAGE_DIR, item.filename)
      if (fs.existsSync(originalPath)) {
        try {
          fs.unlinkSync(originalPath)
          console.log(`已删除本地原图：${originalPath}`)
        } catch (err) {
          console.error(`删除本地原图失败：${err.message}`)
          return res.status(500).json({ error: '删除失败', stage: 'original' })
        }
      }
    }

    if (item.oss_path) {
      try {
        await ossClient.delete(item.oss_path)
        console.log(`已删除 OSS 原图：${item.oss_path}`)
      } catch (err) {
        console.error(`删除 OSS 原图失败：${err.message}`)
      }
    }
    if (item.oss_thumbnail_path) {
      try {
        await ossClient.delete(item.oss_thumbnail_path)
        console.log(`已删除 OSS 缩略图：${item.oss_thumbnail_path}`)
      } catch (err) {
        console.error(`删除 OSS 缩略图失败：${err.message}`)
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
        return res.status(500).json({ error: '删除失败', stage: 'thumbnail' })
      }
    }
  }

  for (const dir of [VIDEO_DIR, IMAGE_DIR, THUMBNAIL_DIR]) {
    const dateDirPath = path.join(dir, dateDir)
    if (fs.existsSync(dateDirPath) && fs.readdirSync(dateDirPath).length === 0) {
      try {
        fs.rmdirSync(dateDirPath)
      } catch (err) {
        console.error(`清理空目录失败：${err.message}`)
      }
    }
  }

  db.prepare('DELETE FROM album WHERE id = ?').run(id)
  res.json({ success: true })
})

// Download URL
router.get('/api/album/:id/download', authMiddleware, (req, res) => {
  const { id } = req.params
  const item = db.prepare('SELECT * FROM album WHERE id = ?').get(id)

  if (!item) {
    return res.status(404).json({ error: '文件不存在' })
  }

  let downloadUrl
  if (item.media_type === 'video') {
    downloadUrl = item.oss_compressed_url || item.oss_url || `/videos/${item.filename}`
  } else {
    downloadUrl = item.oss_url || `/uploads/${item.filename}`
  }

  if (!downloadUrl) {
    return res.status(404).json({ error: '文件不存在' })
  }

  res.json({ downloadUrl })
})

// OSS image upload confirm
router.post('/api/album/image/confirm', authMiddleware, async (req, res) => {
  const { ossPath, originalName, dateDir, fileSize } = req.body
  if (!ossPath || !originalName) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  const taskId = uuidv4()
  processingTasks.set(taskId, {
    id: taskId,
    status: 'processing',
    progress: 0,
    message: '正在处理...',
    ossPath,
    originalName,
    dateDir,
    createdAt: new Date().toISOString()
  })

  processImageAsync(taskId, ossPath, originalName, dateDir).catch(err => {
    console.error(`异步处理任务 ${taskId} 失败:`, err)
    const task = processingTasks.get(taskId)
    if (task) {
      task.status = 'failed'
      task.error = err.message
    }
  })

  res.json({ success: true, taskId })
})

export default router
