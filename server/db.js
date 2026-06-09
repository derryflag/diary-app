import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.join(__dirname, '../data')
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const db = new Database(path.join(DATA_DIR, 'diary.db'))

// 启用 WAL 模式提升并发性能
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')

// 初始化表结构
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
const tmpUser = db.prepare('SELECT id FROM users WHERE username = ?').get('tmpuser')
if (!tmpUser) {
  db.prepare('INSERT INTO users (username) VALUES (?)').run('tmpuser')
  console.log('已创建临时用户: tmpuser')
}

export default db
