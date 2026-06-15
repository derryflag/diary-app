import './env.js'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import diaryRouter from './routes/diary.js'
import albumRouter from './routes/album.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.join(__dirname, '../data')
const PROCESSING_DIR = path.join(DATA_DIR, 'processing')
const IMAGE_DIR = path.join(DATA_DIR, 'album')
const VIDEO_DIR = path.join(DATA_DIR, 'video')
const THUMBNAIL_DIR = path.join(DATA_DIR, 'thumbnail')

for (const dir of [DATA_DIR, PROCESSING_DIR, IMAGE_DIR, VIDEO_DIR, THUMBNAIL_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors({
  origin: true,
  credentials: true
}))
app.use(express.json())

app.use(express.static(path.join(__dirname, '../dist')))

// 挂载路由
app.use(diaryRouter)
app.use(albumRouter)

// 静态文件服务
const setStaticCacheHeaders = (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=604800')
  next()
}

app.use('/uploads', setStaticCacheHeaders, express.static(IMAGE_DIR, { maxAge: '7d' }))
app.use('/thumbnails', setStaticCacheHeaders, express.static(THUMBNAIL_DIR, { maxAge: '7d' }))
app.use('/videos', setStaticCacheHeaders, express.static(VIDEO_DIR, { maxAge: '7d' }))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务已启动: http://0.0.0.0:${PORT}`)
})
