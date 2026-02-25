// 日记工具函数

/**
 * 根据日期获取日记
 * @param {string} date 日期字符串 (YYYY-MM-DD)
 * @param {Array} diaries 日记数组
 * @returns {Object|null} 找到的日记对象或null
 */
export const getDiaryByDate = (date, diaries) => {
  return diaries.find(diary => diary.date === date) || null
}

/**
 * 保存日记到本地存储
 * @param {Array} diaries 日记数组
 */
export const saveDiaries = (diaries) => {
  localStorage.setItem('diaries', JSON.stringify(diaries))
}

/**
 * 从本地存储加载日记
 * @returns {Array} 日记数组
 */
export const loadDiaries = () => {
  return JSON.parse(localStorage.getItem('diaries') || '[]')
}

/**
 * 创建新日记
 * @param {string} date 日期
 * @param {string} content 内容
 * @returns {Object} 新日记对象
 */
export const createDiary = (date, content) => {
  return {
    id: Date.now().toString(),
    date,
    content
  }
}

/**
 * 更新日记
 * @param {Array} diaries 日记数组
 * @param {string} id 日记ID
 * @param {Object} updates 更新内容
 * @returns {Array} 更新后的日记数组
 */
export const updateDiary = (diaries, id, updates) => {
  const index = diaries.findIndex(d => d.id === id)
  if (index !== -1) {
    diaries[index] = { ...diaries[index], ...updates }
  }
  return diaries
}

/**
 * 删除日记
 * @param {Array} diaries 日记数组
 * @param {string} id 日记ID
 * @returns {Array} 删除后的日记数组
 */
export const deleteDiary = (diaries, id) => {
  return diaries.filter(d => d.id !== id)
}