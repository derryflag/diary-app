import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'url'
import exifr from 'exifr'
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

const looksLikeValidDate = (yyyymmdd) => {
  if (!/^\d{8}$/.test(yyyymmdd)) return false
  const year = parseInt(yyyymmdd.slice(0, 4), 10)
  const month = parseInt(yyyymmdd.slice(4, 6), 10)
  const day = parseInt(yyyymmdd.slice(6, 8), 10)
  if (year < 1990 || year > 2100) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  return true
}

const getDateDir = (filename) => {
  const match = filename.match(/^(?:IMG|VID)[_-](\d{8})/i)
  if (match && looksLikeValidDate(match[1])) return match[1]
  const mmexportMatch = filename.match(/mmexport(\d{13})/i)
  if (mmexportMatch) {
    const timestamp = parseInt(mmexportMatch[1])
    const date = new Date(timestamp)
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  }
  const digits = filename.match(/(\d{8})/)
  if (digits && looksLikeValidDate(digits[1])) return digits[1]
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
}

const isVideoFile = (filename) => {
  const ext = path.extname(filename).toLowerCase()
  return VIDEO_TYPES.includes(ext)
}

// 从图片 EXIF 中提取拍摄时间，失败时返回 null
// 图片格式才调用此函数，视频请勿调用
const getDateDirFromExif = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null
    const stats = fs.statSync(filePath)
    if (stats.size === 0) return null

    const exif = await exifr.parse(filePath, { tz: true }).catch(() => null)
    if (!exif) return null

    const date = exif.DateTimeOriginal || exif.DateTime || exif.CreateDate || exif.DateTimeDigitized
    if (!(date instanceof Date) || isNaN(date.getTime())) return null

    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    if (y < 1990 || y > 2100) return null
    return `${y}${m}${d}`
  } catch (err) {
    return null
  }
}

// MP4 / MOV 的 mvhd.creation_time 解析（用成熟库 music-metadata）
// 它会正确处理 moov 在文件尾部、64 位扩展 size 等各种标准/非标 MP4 布局
import * as mm from 'music-metadata'

const getDateDirFromMp4 = async (filePath) => {
  const debug = []
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      debug.push('文件不存在')
      return { dateDir: null, reason: debug.join('；') }
    }
    const stat = fs.statSync(filePath)
    debug.push(`文件大小=${(stat.size / 1024 / 1024).toFixed(2)}MB`)

    // music-metadata 内部用流式解析器，能自动定位 moov 位置
    const metadata = await mm.parseFile(filePath, {
      duration: false,
      skipCovers: true,
      mimeType: 'video/mp4'
    })

    // 有两个可能的日期来源：
    // 1) format.creationTime —— 大多数现代 MP4/MOV 都会写 mvhd.creation_time
    // 2) common.year —— 回退项（若库能从 tag 中推断年份）
    let creationTime = null
    if (metadata && metadata.format && metadata.format.creationTime) {
      creationTime = metadata.format.creationTime
    } else if (metadata && metadata.common && metadata.common.year) {
      debug.push(`未取到 creationTime，fallback 到 common.year=${metadata.common.year}`)
      creationTime = new Date(metadata.common.year, 0, 1)
    } else {
      debug.push('music-metadata 未返回 creationTime 或 year')
      return { dateDir: null, reason: debug.join('；') }
    }

    // creationTime 可能是 Date 对象、ISO 字符串、或 epoch 毫秒数——new Date() 都能处理
    const date = (creationTime instanceof Date) ? creationTime : new Date(creationTime)
    if (isNaN(date.getTime())) {
      debug.push(`解析日期失败: creationTime=${creationTime}`)
      return { dateDir: null, reason: debug.join('；') }
    }

    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    debug.push(`解析到 UTC 日期: ${y}-${m}-${d}`)
    if (y < 1990 || y > 2100) {
      debug.push(`年份${y}超出范围(1990-2100)，丢弃`)
      return { dateDir: null, reason: debug.join('；') }
    }
    return { dateDir: `${y}${m}${d}`, reason: debug.join('；') }
  } catch (err) {
    return { dateDir: null, reason: `异常: ${err.message}` }
  }
}

// 综合推断日期
//   图片：EXIF > 文件名 > mtime > 今天
//   视频：MP4/MOV mvhd > 文件名 > mtime > 今天
// 说明：手机上传的文件 mtime 永远是"上传瞬间"，不能反映拍摄时间，故放最后兜底
const resolveDateDir = async (filePath, originalName, isVideo) => {
  const name = originalName || (filePath ? path.basename(filePath) : '')
  const kind = isVideo ? '视频' : '图片'
  const logLines = [`[日期推断] ${name} (${kind})`]

  let result = null
  if (filePath) {
    if (isVideo) {
      const mp4Result = await getDateDirFromMp4(filePath)
      const fromMp4 = mp4Result ? mp4Result.dateDir : null
      const mp4Reason = mp4Result && mp4Result.reason ? ` (${mp4Result.reason})` : ''
      logLines.push(`  MP4/mvhd: ${fromMp4 || '无'}${mp4Reason}`)
      if (fromMp4) result = fromMp4
    } else {
      const fromExif = await getDateDirFromExif(filePath)
      logLines.push(`  EXIF: ${fromExif || '无'}`)
      if (fromExif) result = fromExif
    }
  }

  if (!result) {
    const fromName = getDateDir(name)
    logLines.push(`  文件名: ${fromName}`)
    if (fromName && /^\d{8}$/.test(fromName)) {
      const y = parseInt(fromName.slice(0, 4), 10)
      if (y >= 1990 && y <= 2100) result = fromName
    }
  }

  if (!result && filePath && fs.existsSync(filePath)) {
    try {
      const mtime = fs.statSync(filePath).mtime
      const y = mtime.getFullYear()
      if (y >= 1990 && y <= 2100) {
        result = `${y}${String(mtime.getMonth() + 1).padStart(2, '0')}${String(mtime.getDate()).padStart(2, '0')}`
        logLines.push(`  mtime: ${result}`)
      }
    } catch (_) {}
  }

  if (!result) {
    const now = new Date()
    result = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    logLines.push(`  兜底(今天): ${result}`)
  } else {
    logLines.push(`  → 最终采用: ${result}`)
  }

  console.log(logLines.join('\n'))
  return result
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
    // 前端上传是走公网 OSS 的签名 URL
    const url = publicClient.signatureUrl(ossPath, {
      method: 'PUT',
      expires: 300,
      contentType,
      'Content-Type': contentType
    })

    console.log(
      `[OSS签名] 文件=${filename}(${fileSize ? (fileSize / 1024 / 1024).toFixed(2) + ' MB' : '?'}), ` +
      `endpoint=公网(${ossConfig.publicEndpoint}), ` +
      `ossPath=${ossPath}`
    )

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
// 先把文件存到临时目录，随后在异步处理时基于 EXIF/文件名推断真实的 dateDir 再移动
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(PROCESSING_DIR)) {
      fs.mkdirSync(PROCESSING_DIR, { recursive: true })
    }
    cb(null, PROCESSING_DIR)
  },
  filename: (req, file, cb) => {
    const safeName = `${uuidv4()}_${file.originalname.replace(/[^\w.\-+]+/g, '_')}`
    cb(null, safeName)
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
    const isVid = isVideoFile(file.originalname)

    processingTasks.set(taskId, {
      id: taskId,
      status: 'processing',
      progress: 0,
      message: '正在处理...',
      filePath: file.path,
      originalName: file.originalname,
      mediaType: isVid ? 'video' : 'image',
      createdAt: new Date().toISOString()
    })

    // dateDir 传 null，让 processMediaAsync 内部基于 EXIF/文件修改时间推断
    processMediaAsync(taskId, file.path, file.originalname, null, isVid).catch(err => {
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
    // 若调用方未提供 dateDir，则基于 EXIF/文件时间/文件名推断
    if (!dateDir) {
      task.progress = 5
      task.message = '正在读取拍摄时间...'
      dateDir = await resolveDateDir(filePath, originalName, isVid)
    }

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
      console.log(`[${taskId}] 视频处理完成: ${originalName} → ${dateDir}`)
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
      console.log(`[${taskId}] 图片处理完成: ${originalName} → ${dateDir}`)
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
    console.log(`[${taskId}] [OSS-下载视频] endpoint=内部(${ossEndpoint}), path=${ossPath}`)
    await ossClient.get(ossPath, downloadPath)

    // 下载后重新基于文件内容推断 dateDir（覆盖前端按文件名猜测的 dateDir，更准确）
    const resolvedDateDir = await resolveDateDir(downloadPath, originalName, true)
    if (resolvedDateDir) dateDir = resolvedDateDir

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
    console.log(
      `[${taskId}] [OSS-上传缩略图] endpoint=内部(${ossEndpoint}), ` +
      `path=${ossThumbnailPath}${fs.existsSync(thumbPath) ? ', size=' + (fs.statSync(thumbPath).size / 1024).toFixed(1) + ' KB' : ''}`
    )
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
    console.log(
      `[${taskId}] [OSS-上传压缩视频] endpoint=内部(${ossEndpoint}), ` +
      `path=${ossCompressedPath}${fs.existsSync(compressedPath) ? ', size=' + (fs.statSync(compressedPath).size / 1024 / 1024).toFixed(2) + ' MB' : ''}`
    )
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
    // 先从 OSS 下载原始图片，然后读取 EXIF 来确定拍摄日期
    task.progress = 5
    task.message = '正在下载原图...'
    console.log(`[${taskId}] [OSS-下载图片] endpoint=内部(${ossEndpoint}), path=${ossPath}`)
    await ossClient.get(ossPath, downloadPath)

    const resolvedDateDir = await resolveDateDir(downloadPath, originalName, false)
    if (resolvedDateDir) dateDir = resolvedDateDir

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
    console.log(
      `[${taskId}] [OSS-上传缩略图] endpoint=内部(${ossEndpoint}), ` +
      `path=${ossThumbnailPath}${fs.existsSync(thumbPath) ? ', size=' + (fs.statSync(thumbPath).size / 1024).toFixed(1) + ' KB' : ''}`
    )
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
        console.log(`[OSS-删除] endpoint=内部(${ossConfig.endpoint}), path=${ossPath}`)
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
        console.log(`[OSS-删除] endpoint=内部(${ossConfig.endpoint}), path=${item.oss_path}`)
        await ossClient.delete(item.oss_path)
        console.log(`已删除 OSS 原图：${item.oss_path}`)
      } catch (err) {
        console.error(`删除 OSS 原图失败：${err.message}`)
      }
    }
    if (item.oss_thumbnail_path) {
      try {
        console.log(`[OSS-删除] endpoint=内部(${ossConfig.endpoint}), path=${item.oss_thumbnail_path}`)
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
