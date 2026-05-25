import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000'
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '250121'
const TEST_TIMEOUT = 30000

let token = ''
let taskId = ''
let albumId = ''
let passed = 0
let failed = 0
let total = 0

function log(msg, type = 'info') {
  const icons = { ok: '✅', fail: '❌', info: 'ℹ️', test: '🧪' }
  console.log(`  ${icons[type] || ''} ${msg}`)
}

function assert(condition, msg) {
  total++
  if (condition) {
    passed++
    log(`${msg}`, 'ok')
  } else {
    failed++
    log(`${msg}`, 'fail')
  }
}

async function api(method, url, options = {}) {
  const headers = { ...options.headers }
  if (token && !url.includes('/api/auth/verify')) {
    headers['Authorization'] = token
  }

  const res = await fetch(url, { method, headers, ...options })
  let data
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data }
}

async function runTest(name, fn) {
  try {
    log(`测试: ${name}`, 'test')
    await fn()
  } catch (err) {
    total++
    failed++
    log(`${name} 抛出异常: ${err.message}`, 'fail')
  }
}

async function main() {
  console.log('\n=== 回归测试开始 ===\n')

  // 1. 未授权访问
  await runTest('未授权访问应返回 401', async () => {
    const { status } = await api('GET', `${BASE_URL}/api/album`)
    assert(status === 401, '未授权访问 /api/album 返回 401')
  })

  // 2. 错误密码
  await runTest('错误密码应返回 403', async () => {
    const { status } = await api('POST', `${BASE_URL}/api/auth/verify`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrongpassword' })
    })
    assert(status === 403, '错误密码返回 403')
  })

  // 3. 正确密码登录
  await runTest('正确密码登录应返回 token', async () => {
    const { status, data } = await api('POST', `${BASE_URL}/api/auth/verify`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ACCESS_PASSWORD })
    })
    assert(status === 200, '登录返回 200')
    assert(data && data.success, '登录 success=true')
    assert(data && data.token, '返回包含 token')
    token = data.token
  })

  // 4. 浏览相册
  await runTest('浏览相册应返回 200', async () => {
    const { status, data } = await api('GET', `${BASE_URL}/api/album`)
    assert(status === 200, 'GET /api/album 返回 200')
    assert(Array.isArray(data), '返回数据是数组')
  })

  // 5. 上传照片
  const testImagePath = path.join(__dirname, '../test-assets/test.jpg')
  const hasTestImage = fs.existsSync(testImagePath)

  if (hasTestImage) {
    await runTest('上传照片应成功', async () => {
      const formData = new FormData()
      formData.append('file', new Blob([fs.readFileSync(testImagePath)], { type: 'image/jpeg' }), 'IMG_20240101.jpg')

      const res = await fetch(`${BASE_URL}/api/album/upload`, {
        method: 'POST',
        headers: { Authorization: token },
        body: formData
      })
      const data = await res.json()
      assert(res.status === 200, '上传照片返回 200')
      assert(data.success, '上传照片 success=true')
      assert(data.taskId, '返回 taskId')
      taskId = data.taskId
    })

    // 6. 轮询任务状态
    await runTest('照片处理任务应完成', async () => {
      const start = Date.now()
      while (Date.now() - start < TEST_TIMEOUT) {
        const { status, data } = await api('GET', `${BASE_URL}/api/album/${taskId}/status`)
        if (data.status === 'completed') {
          albumId = data.data?.id
          assert(true, `照片处理完成，id: ${albumId}`)
          return
        }
        if (data.status === 'failed') {
          assert(false, `照片处理失败: ${data.message}`)
          return
        }
        await new Promise(r => setTimeout(r, 1000))
      }
      assert(false, '照片处理超时')
    })
  } else {
    log('跳过上传测试: 缺少 test-assets/test.jpg', 'info')
  }

  // 7. 再次浏览相册（验证新增照片）
  await runTest('上传后浏览相册应包含新数据', async () => {
    const { status, data } = await api('GET', `${BASE_URL}/api/album`)
    assert(status === 200, '再次 GET /api/album 返回 200')
  })

  // 8. 删除刚上传的照片（清理）
  if (albumId) {
    await runTest('删除照片应成功', async () => {
      const { status, data } = await api('DELETE', `${BASE_URL}/api/album/${albumId}`)
      assert(status === 200, 'DELETE /api/album/:id 返回 200')
      assert(data.success, '删除 success=true')
    })
  }

  // 9. 获取日记（验证日记接口也正常）
  await runTest('获取日记应返回 200', async () => {
    const { status } = await api('GET', `${BASE_URL}/api/diaries`)
    assert(status === 200, 'GET /api/diaries 返回 200')
  })

  // 汇总
  console.log(`\n=== 回归测试结束 ===`)
  console.log(`总计: ${total} | 通过: ${passed} | 失败: ${failed}`)

  if (failed > 0) {
    console.log('\n❌ 有测试未通过，请检查！')
    process.exit(1)
  } else {
    console.log('\n✅ 全部通过！')
    process.exit(0)
  }
}

main().catch(err => {
  console.error('测试执行异常:', err)
  process.exit(1)
})
