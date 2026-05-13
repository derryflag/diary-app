import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import OSS from 'ali-oss'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, '.env')

dotenv.config({ path: envPath })

const isProduction = process.env.NODE_ENV === 'production'

const client = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  endpoint: isProduction 
    ? process.env.OSS_ENDPOINT  // 内网
    : process.env.OSS_PUBLIC_ENDPOINT  // 公网
})

export default client
