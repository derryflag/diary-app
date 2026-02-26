const DB_NAME = 'diary-app'
const DB_VERSION = 2
const STORE_NAME = 'diaries'

let db = null

const openDB = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = event.target.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'date' })
      }
    }
  })
}

export const dbAPI = {
  async getAll() {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result || [])
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  },

  async add(diary) {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(diary)

      request.onsuccess = () => {
        resolve(diary)
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  },

  async delete(date) {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(date)

      request.onsuccess = () => {
        resolve()
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  },

  async clear() {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => {
        resolve()
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  },

  async bulkPut(diaries) {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      diaries.forEach(diary => {
        store.put(diary)
      })

      transaction.oncomplete = () => {
        resolve()
      }

      transaction.onerror = () => {
        reject(transaction.error)
      }
    })
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
