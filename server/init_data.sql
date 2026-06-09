-- 初始化基础数据
-- 使用方法: sqlite3 data/diary.db < init_data.sql

-- 创建临时用户（生产部署时先跑 schema.sql）
INSERT OR IGNORE INTO users (username) VALUES ('tmpuser');
