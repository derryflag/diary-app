const isDev = import.meta.env.DEV
const API_BASE = isDev ? 'http://localhost:3000' : ''

const readDiariesFromServer = async () => {
  const res = await fetch(`${API_BASE}/api/diaries`)
  return await res.json()
}

const saveDiaryToServer = async (diary) => {
  const res = await fetch(`${API_BASE}/api/diaries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diary)
  })
  return await res.json()
}

const deleteDiaryFromServer = async (date) => {
  const res = await fetch(`${API_BASE}/api/diaries/${date}`, {
    method: 'DELETE'
  })
  return await res.json()
}

export const dbAPI = {
  async getAll() {
    return await readDiariesFromServer()
  },

  async add(diary) {
    return await saveDiaryToServer(diary)
  },

  async delete(date) {
    return await deleteDiaryFromServer(date)
  },

  async clear() {
    const diaries = await readDiariesFromServer()
    for (const diary of diaries) {
      await deleteDiaryFromServer(diary.date)
    }
  },

  async bulkPut(diaries) {
    for (const diary of diaries) {
      await saveDiaryToServer(diary)
    }
  }
}

export const exportToJSON = (diaries) => {
  const sortedDiaries = [...diaries].sort((a, b) => a.date.localeCompare(b.date))
  const exportData = sortedDiaries.map(d => ({
    date: d.date,
    content: d.content
  }))
  const data = JSON.stringify(exportData, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const date = new Date().toISOString().split('T')[0]
  a.download = `diary-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export const importFromJSON = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const diaries = JSON.parse(e.target.result)
        if (!Array.isArray(diaries)) {
          reject(new Error('文件格式错误'))
          return
        }
        const validDiaries = diaries.filter(d => d.date && d.content).map(d => ({
          date: d.date,
          content: d.content
        }))
        resolve(validDiaries)
      } catch (err) {
        reject(new Error('JSON 解析失败'))
      }
    }

    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }

    reader.readAsText(file)
  })
}
