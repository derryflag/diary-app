-- 日记本数据库建表脚本
-- 使用方法: sqlite3 data/diary.db < schema.sql

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

CREATE TABLE IF NOT EXISTS album (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    thumbnail TEXT,
    media_type TEXT NOT NULL,
    upload_time DATETIME NOT NULL,
    file_size INTEGER,
    duration INTEGER,
    title TEXT,
    oss_path TEXT,
    oss_compressed_path TEXT,
    oss_thumbnail_path TEXT,
    oss_url TEXT,
    oss_compressed_url TEXT,
    oss_thumbnail_url TEXT
);
