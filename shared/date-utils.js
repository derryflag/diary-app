// 文件名日期提取（统一入口）
//   所有"从文件名/任意字符串里提取 8 位日期"的地方都调这个方法
//
// 判定顺序：
//   1) 用 FILENAME_DATE_REGEX 匹配 YYYYMMDD / YYYY-MM-DD / YYYY_MM_DD
//      - 年份 20xx，月份 01-12，日期 01-31
//      - 左侧(?<!\d) 防止被 13 位时间戳的前 8 位误识别为日期
//      - 右侧(?!\d) 防止吃掉后续数字（如 20240622123...）
//      - 命中后转成 YYYYMMDD 返回
//   2) 否则用 TIMESTAMP_REGEX 匹配 13 位数字
//      - 视作毫秒级时间戳，转成日期
//   3) 都没命中，返回当天日期
//
// 每次判定都会 console.log 打印依据，方便排查
//
// 该文件放在项目根目录 shared/ 下，前后端共用：
//   - 后端 server/routes/album.js  import from '../../shared/date-utils.js'
//   - 前端 src/views/Album.vue    import from '../../shared/date-utils.js'
// 注意：本文件必须保持纯 JS，不能引入 Node 或浏览器专属 API

const FILENAME_DATE_REGEX = /(?<!\d)20[0-9]{2}[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12][0-9]|3[01])(?!\d)/
const TIMESTAMP_REGEX = /(?<!\d)\d{13}/

const looksLikeValidDate = (yyyymmdd) => {
  if (!/^\d{8}$/.test(yyyymmdd)) return false
  const year = parseInt(yyyymmdd.slice(0, 4), 10)
  const month = parseInt(yyyymmdd.slice(4, 6), 10)
  const day = parseInt(yyyymmdd.slice(6, 8), 10)
  if (year < 1990 || year > 2100) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  return true
}

/**
 * 从任意字符串（通常是文件名）中提取拍摄日期（YYYYMMDD）
 * 统一入口：所有需要从文件名/字符串拿日期的地方都调这个方法
 * @param {string} input
 * @returns {string} YYYYMMDD 格式的日期字符串；找不到则返回当天
 */
export const extractDateFromFilename = (input) => {
  const safeInput = (input == null) ? '' : String(input)
  const today = new Date()
  const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`

  if (!safeInput) {
    console.log(`[extractDateFromFilename] 输入为空，兜底返回当天: ${todayStr}`)
    return todayStr
  }

  // ---- 第 1 级：8 位日期（YYYYMMDD / YYYY-MM-DD / YYYY_MM_DD）----
  const dateMatch = safeInput.match(FILENAME_DATE_REGEX)
  if (dateMatch) {
    const normalized = dateMatch[0].replace(/[-_]/g, '')
    if (looksLikeValidDate(normalized)) {
      console.log(`[extractDateFromFilename] 第1级匹配命中日期字符串 "${dateMatch[0]}" → ${normalized}（输入="${safeInput}"）`)
      return normalized
    }
    console.log(`[extractDateFromFilename] 第1级匹配到 "${dateMatch[0]}" 但合法性校验失败，继续尝试下一级（输入="${safeInput}"）`)
  } else {
    console.log(`[extractDateFromFilename] 第1级正则未命中，尝试第2级13位时间戳（输入="${safeInput}"）`)
  }

  // ---- 第 2 级：13 位毫秒时间戳 ----
  const tsMatch = safeInput.match(TIMESTAMP_REGEX)
  if (tsMatch) {
    const ts = parseInt(tsMatch[0], 10)
    if (Number.isFinite(ts) && ts > 0) {
      const d = new Date(ts)
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear()
        if (y >= 1990 && y <= 2100) {
          const result = `${y}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
          console.log(`[extractDateFromFilename] 第2级匹配命中13位时间戳 "${tsMatch[0]}" → ${result}（输入="${safeInput}"）`)
          return result
        }
        console.log(`[extractDateFromFilename] 第2级时间戳 ${ts} 转出年份 ${y} 超出范围(1990-2100)，继续尝试下一级（输入="${safeInput}"）`)
      } else {
        console.log(`[extractDateFromFilename] 第2级时间戳 ${ts} 转 Date 失败，继续尝试下一级（输入="${safeInput}"）`)
      }
    } else {
      console.log(`[extractDateFromFilename] 第2级时间戳 "${tsMatch[0]}" 解析为 NaN，继续尝试下一级（输入="${safeInput}"）`)
    }
  } else {
    console.log(`[extractDateFromFilename] 第2级13位时间戳未命中，兜底返回当天（输入="${safeInput}"）`)
  }

  // ---- 第 3 级：兜底返回当天 ----
  console.log(`[extractDateFromFilename] 全部未命中，兜底返回当天: ${todayStr}（输入="${safeInput}"）`)
  return todayStr
}
