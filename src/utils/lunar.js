// 使用开源农历计算库
import solarLunar from 'solarlunar'

// 传统节日映射（农历日期到节日名称）
const lunarFestivals = {
  '1-1': '春节',
  '1-15': '元宵节',
  '2-2': '龙抬头',
  '5-5': '端午节',
  '7-7': '七夕节',
  '8-15': '中秋节',
  '9-9': '重阳节',
  '12-8': '腊八节',
  '12-23': '小年',
  '12-30': '除夕'
}

// 二十四节气（2026年准确日期）
const solarTerms2026 = {
  '1-5': '小寒',
  '1-20': '大寒',
  '2-4': '立春',
  '2-18': '雨水',
  '3-5': '惊蛰',
  '3-20': '春分',
  '4-5': '清明',
  '4-20': '谷雨',
  '5-5': '立夏',
  '5-21': '小满',
  '6-6': '芒种',
  '6-21': '夏至',
  '7-7': '小暑',
  '7-23': '大暑',
  '8-8': '立秋',
  '8-23': '处暑',
  '9-8': '白露',
  '9-23': '秋分',
  '10-8': '寒露',
  '10-23': '霜降',
  '11-8': '立冬',
  '11-22': '小雪',
  '12-7': '大雪',
  '12-21': '冬至'
}

/**
 * 将公历日期转换为农历日期
 * @param {string|Date} date 公历日期
 * @returns {Object} 农历信息 {month, day, festival}
 */
export const getLunarInfo = (date) => {
  // 处理时区问题：确保日期解析为本地时间
  let d
  if (typeof date === 'string') {
    const [year, month, day] = date.split('-').map(Number)
    d = new Date(year, month - 1, day)
  } else {
    d = new Date(date)
  }
  
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  
  // 先检查是否是二十四节气（使用2026年准确日期）
  const solarTermsKey = `${month}-${day}`
  if (solarTerms2026[solarTermsKey]) {
    return {
      month: '',
      day: solarTerms2026[solarTermsKey],
      festival: solarTerms2026[solarTermsKey]
    }
  }
  
  // 使用开源库获取农历信息
  try {
    const lunarInfo = solarLunar.solar2lunar(year, month, day)
    
    // 检查是否是传统节日
    const lunarFestivalKey = `${lunarInfo.lMonth}-${lunarInfo.lDay}`
    const festival = lunarFestivals[lunarFestivalKey] || ''
    
    // 直接使用库的中文输出，但去掉月份中的"月"字
    return {
      month: lunarInfo.monthCn.replace('月', ''),
      day: lunarInfo.dayCn,
      festival: festival
    }
  } catch (error) {
    console.error('农历计算错误:', error)
    return {
      month: '',
      day: '',
      festival: ''
    }
  }
}