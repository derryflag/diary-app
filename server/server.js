import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000
const DATA_FILE = path.join(__dirname, 'data', 'diaries.json')
const ALBUM_DIR = path.join(__dirname, 'data', 'album')
const ALBUM_FILE = path.join(__dirname, 'data', 'album.json')

app.use(cors({
  origin: true,
  credentials: true
}))
app.use(express.json())

app.use(express.static(path.join(__dirname, '../dist')))

if (!fs.existsSync(ALBUM_DIR)) {
  fs.mkdirSync(ALBUM_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const match = file.originalname.match(/(\d{8})/)
    const dateDir = match ? match[1] : 'other'
    
    const targetDir = path.join(ALBUM_DIR, dateDir)
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
  const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
  const ext = path.extname(file.originalname).toLowerCase()
  if (allowedTypes.includes(ext)) {
    cb(null, true)
  } else {
    cb(new Error('不支持的图片格式'), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
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
  const dataDir = path.dirname(DATA_FILE)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
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

app.post('/api/album', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传图片文件' })
  }

  const ext = path.extname(req.file.originalname).toLowerCase()
  const match = req.file.originalname.match(/(\d{8})/)
  const dateDir = match ? match[1] : 'other'
  const relativePath = `${dateDir}/${req.file.filename}`

  const album = readAlbum()
  const newItem = {
    id: uuidv4(),
    filename: relativePath,
    originalName: req.file.originalname,
    uploadTime: new Date().toISOString()
  }
  album.unshift(newItem)
  writeAlbum(album)

  res.json({ success: true, data: newItem })
})

app.delete('/api/album/:id', (req, res) => {
  const { id } = req.params
  let album = readAlbum()
  const item = album.find(a => a.id === id)

  if (item) {
    const filePath = path.join(ALBUM_DIR, item.filename)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    const dir = path.dirname(filePath)
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir)
    }
    album = album.filter(a => a.id !== id)
    writeAlbum(album)
    res.json({ success: true })
  } else {
    res.status(404).json({ error: '图片不存在' })
  }
})

app.use('/uploads', express.static(ALBUM_DIR))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

app.listen(PORT, () => {
  console.log(`服务已启动: http://localhost:${PORT}`)
})
