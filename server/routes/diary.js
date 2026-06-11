import express from 'express'
import db from '../db.js'
import { authMiddleware, ACCESS_PASSWORD_LOCAL, AUTH_TOKEN } from '../middleware/auth.js'

const router = express.Router()

// 验证密码
router.post('/api/auth/verify', (req, res) => {
  const { password } = req.body
  if (!password) {
    return res.status(400).json({ error: '缺少密码' })
  }

  if (password === ACCESS_PASSWORD_LOCAL) {
    res.json({ success: true, token: AUTH_TOKEN })
  } else {
    res.status(403).json({ error: '密码错误' })
  }
})

// 获取所有日记
router.get('/api/diaries', authMiddleware, (req, res) => {
  try {
    const diaries = db.prepare(`
      SELECT diary_date as date, content
      FROM diaries
      WHERE user_id = 'tmpuser'
      ORDER BY diary_date DESC
    `).all()
    res.json(diaries)
  } catch (err) {
    console.error('查询日记失败:', err)
    res.status(500).json({ error: '查询失败' })
  }
})

// 创建或更新日记
router.post('/api/diaries', authMiddleware, (req, res) => {
  const { date, content } = req.body
  if (date === undefined || content === undefined) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO diaries (user_id, diary_date, content, created_at, updated_at)
      VALUES ('tmpuser', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, diary_date) DO UPDATE SET
        content = excluded.content,
        updated_at = CURRENT_TIMESTAMP
    `)
    stmt.run(date, content.replace(/^[\s\n]+|[\s\n]+$/g, ''))
    res.json({ success: true })
  } catch (err) {
    console.error('保存日记失败:', err)
    res.status(500).json({ error: '保存失败' })
  }
})

// 删除日记
router.delete('/api/diaries/:date', authMiddleware, (req, res) => {
  const { date } = req.params

  try {
    db.prepare(`
      DELETE FROM diaries
      WHERE user_id = 'tmpuser' AND diary_date = ?
    `).run(date)
    res.json({ success: true })
  } catch (err) {
    console.error('删除日记失败:', err)
    res.status(500).json({ error: '删除失败' })
  }
})

export default router
