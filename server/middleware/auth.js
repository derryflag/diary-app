import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || 'rabbit2024'
export const AUTH_TOKEN = uuidv5(ACCESS_PASSWORD, uuidv5.DNS)

export const authMiddleware = (req, res, next) => {
  const token = req.headers['authorization']
  if (!token || token !== AUTH_TOKEN) {
    return res.status(401).json({ error: '未授权' })
  }
  next()
}

export const ACCESS_PASSWORD_LOCAL = ACCESS_PASSWORD
