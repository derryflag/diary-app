import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const result = dotenv.config({ path: path.resolve(__dirname, '.env'), override: true })
if (result.error) {
  console.warn('加载 .env 文件失败:', result.error.message)
} else {
  console.log(`已加载环境变量: ${path.resolve(__dirname, '.env')}`)
  console.log(`OSS_DATA_DIR: ${process.env.OSS_DATA_DIR}`)
}
