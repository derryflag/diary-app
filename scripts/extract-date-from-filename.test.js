// 单元测试：extractDateFromFilename
// 用 Node 内置 node:test，零依赖
// 用法：node --test scripts/extract-date-from-filename.test.js
//
// 注意：extractDateFromFilename 内部会 console.log 打印判定依据
//       测试时用 mock 屏蔽掉输出（也可以选择保留）

import test from 'node:test'
import assert from 'node:assert/strict'

// === 屏蔽 extractDateFromFilename 内部的 console.log ===
// （让它不影响测试输出，方便看断言结果；想看日志把下面这行注释掉即可）
const originalLog = console.log
console.log = () => {}

// 动态 import：这样 console.log mock 会在 import 时生效
// 共享文件放在项目根目录 shared/ 下，前后端共用；测试直接 import 它即可
const { extractDateFromFilename } = await import('../shared/date-utils.js')

// 还原 console.log（如果以后想在这里打印别的信息）
console.log = originalLog

// 工具：断言返回值是 YYYYMMDD 8 位数字串
const expectDate = (input, expected) => {
  const got = extractDateFromFilename(input)
  assert.equal(got, expected, `输入 "${input}" 期望 "${expected}"，实际 "${got}"`)
}

// =================== 1) 第 1 级：8 位日期匹配 ===================
test('第1级 - 标准 VID_20240622_xxx.mp4', () => {
  expectDate('VID_20240622_xxx.mp4', '20240622')
})

test('第1级 - 标准 IMG_20240622_xxx.jpg', () => {
  expectDate('IMG_20240622_xxx.jpg', '20240622')
})

test('第1级 - 不带 IMG/VID 前缀，纯数字 8 位', () => {
  expectDate('20240622_xxx.mp4', '20240622')
})

test('第1级 - YYYY-MM-DD 格式', () => {
  expectDate('VID_2024-06-22_xxx.mp4', '20240622')
})

test('第1级 - YYYY_MM_DD 格式', () => {
  expectDate('VID_2024_06_22_xxx.mp4', '20240622')
})

test('第1级 - 在文件中间位置也能匹配', () => {
  expectDate('abc_20240622_001.jpg', '20240622')
})

test('第1级 - 文件末尾也能匹配', () => {
  expectDate('photo_20240622', '20240622')
})

test('第1级 - 多种分隔符混用（这里不会出现，但测一下）', () => {
  expectDate('2024-06-22', '20240622')
})

// =================== 2) 第 1 级：边界条件 ===================
test('第1级 - 13位时间戳不会被误识别为日期（验证左侧 ?<!\\d）', () => {
  // 1719100800000 这个 13 位数字，前 8 位是 17191008
  // 左侧有数字 1，所以不应该被识别成 2024 年的日期
  // 应该落到第 2 级被识别为时间戳 → 转成对应日期（用本地 Date 算 YYYYMMDD）
  const ts = 1719100800000
  const d = new Date(ts)
  const expected = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  expectDate('mmexport' + ts + '.jpg', expected)
})

test('第1级 - 日期后接数字（验证右侧 (?!\\d)）', () => {
  // 202406221230 这里 20240622 后接 1230，应该不被匹配
  // 而 2024 06 22 整体没有其他 8 位数字
  // 不应该被识别为 2024-06-22
  // 应该落到第 3 级兜底（当天）
  const result = extractDateFromFilename('202406221230.jpg')
  // 兜底返回当天，这里只验证它不是 20240622
  assert.notEqual(result, '20240622', '20240622 后接 1230 不应该被识别为 2024-06-22')
  // 应该是当天
  const now = new Date()
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  assert.equal(result, today, '应该兜底返回当天')
})

// =================== 3) 月份/日期合法性 ===================
test('第1级 - 月份 18 非法，不应被匹配', () => {
  // 20181315 中 18 月非法
  const result = extractDateFromFilename('20181315.txt')
  // 应落到兜底
  const now = new Date()
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  assert.equal(result, today, '20181315 月份非法，应该兜底返回当天')
})

test('第1级 - 日期 99 非法，不应被匹配', () => {
  const result = extractDateFromFilename('20240999.txt')
  const now = new Date()
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  assert.equal(result, today, '20240999 日期非法，应该兜底返回当天')
})

test('第1级 - 年份 1999 不在 20xx 范围，不会被识别', () => {
  // 1999 不会触发第 1 级（要求 20xx），如果文件名只有这个就会落到兜底
  const result = extractDateFromFilename('19990115.txt')
  const now = new Date()
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  assert.equal(result, today, '1999xxxx 年份不在 20xx 范围，应该兜底返回当天')
})

test('第1级 - 20001231 年份合法可识别', () => {
  expectDate('20001231.txt', '20001231')
})

test('第1级 - 20991231 年份合法可识别', () => {
  expectDate('20991231.txt', '20991231')
})

test('第1级 - 21000101 年份超出范围，不识别', () => {
  const result = extractDateFromFilename('21000101.txt')
  const now = new Date()
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  assert.equal(result, today, '21000101 年份超出 2100，应该兜底返回当天')
})

// =================== 4) 第 2 级：13 位时间戳 ===================
test('第2级 - 13位毫秒时间戳 1719100800000 → 2024-06-22', () => {
  // 1719100800000 = 2024-06-22 UTC（具体依赖时区，但 Date 会本地化）
  // 用本地 Date 算对应 YYYYMMDD
  const ts = 1719100800000
  const d = new Date(ts)
  const expected = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  expectDate('mmexport' + ts + '.jpg', expected)
})

test('第2级 - 纯 13 位数字无前缀也能识别', () => {
  const ts = 1700000000000  // 2023-11-14
  const d = new Date(ts)
  const expected = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  expectDate('photo_' + ts + '.jpg', expected)
})

test('第2级 - 13 位前后有其他数字时，能找到 13 位', () => {
  // 文件名里只有一段 13 位时间戳
  const ts = 1719100800000
  const d = new Date(ts)
  const expected = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  expectDate('prefix_' + ts + '_suffix.jpg', expected)
})

// =================== 5) 第 3 级：兜底 ===================
test('第3级 - 完全无数字字符串，兜底当天', () => {
  const result = extractDateFromFilename('random.mp4')
  const now = new Date()
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  assert.equal(result, today, '无任何数字/日期，应返回当天')
})

test('第3级 - 只有短数字串（不是 8 位也不是 13 位）', () => {
  const result = extractDateFromFilename('IMG_123.jpg')
  const now = new Date()
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  assert.equal(result, today, '只有 3 位数字，不应被识别，应返回当天')
})

// =================== 6) 极端输入 ===================
test('极端 - 空字符串，兜底当天', () => {
  const result = extractDateFromFilename('')
  const now = new Date()
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  assert.equal(result, today, '空字符串，应返回当天')
})

test('极端 - null，兜底当天', () => {
  const result = extractDateFromFilename(null)
  const now = new Date()
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  assert.equal(result, today, 'null，应返回当天')
})

test('极端 - undefined，兜底当天', () => {
  const result = extractDateFromFilename(undefined)
  const now = new Date()
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  assert.equal(result, today, 'undefined，应返回当天')
})

test('极端 - 非字符串数字，自动转字符串', () => {
  // 直接传 13 位毫秒数（数字类型），应能转字符串后命中第 2 级
  const ts = 1719100800000
  const d = new Date(ts)
  const expected = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  assert.equal(extractDateFromFilename(ts), expected)
})

// =================== 7) 优先级确认：第 1 级 > 第 2 级 > 第 3 级 ===================
test('优先级 - 同一文件名中同时有日期和 13 位时间戳，第 1 级优先', () => {
  // 这里没有"合法的第 1 级日期"在 13 位时间戳之前，所以会走第 2 级
  // 但反过来：如果前面有 20240622，后面跟一串 13 位数字，应该取 20240622
  const ts = 1719100800000
  expectDate('20240622_' + ts + '.jpg', '20240622')
})

// =================== 8) "左起第一次匹配" 验证 ===================
test('左起 - 文件名有两个合法日期，以左起第一个为准', () => {
  // 20240115 在前，20240622 在后，应该取 20240115
  expectDate('20240115_to_20240622.jpg', '20240115')
})
