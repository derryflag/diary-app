import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000
const DATA_FILE = path.join(__dirname, 'data', 'diaries.json')

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}))
app.use(express.json())

app.use(express.static(path.join(__dirname, '../dist')))

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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

app.listen(PORT, () => {
  console.log(`服务已启动: http://localhost:${PORT}`)
})
