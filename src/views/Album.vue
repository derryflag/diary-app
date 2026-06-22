<template>
  <div class="album-view">
    <div class="album-header">
      <h1>灰兔相册</h1>
      <button class="jump-btn" @click="showJumpPanel = true" title="跳转到指定日期">📅 跳转</button>
      <div class="column-control">
        <span>每行</span>
        <button 
          v-for="n in [3, 4, 5]" 
          :key="n" 
          :class="{ active: columnCount === n }"
          @click="columnCount = n"
        >{{ n }}</button>
        <span>个</span>
      </div>
    </div>

    <div v-if="showJumpPanel" class="jump-panel-overlay" @click.self="showJumpPanel = false">
      <div class="jump-panel">
        <div class="jump-panel-header">
          <h3>跳转到指定日期</h3>
          <button class="close-panel-btn" @click="showJumpPanel = false">×</button>
        </div>
        <div class="jump-panel-section">
          <div class="section-label">快捷选择</div>
          <div class="quick-buttons">
            <button v-for="btn in quickJumpButtons" :key="btn.label" @click="handleQuickJump(btn.offset)">
              {{ btn.label }}
            </button>
          </div>
        </div>
        <div class="jump-panel-section">
          <div class="section-label">选择年月</div>
          <div class="date-selectors">
            <select v-model="selectedYear" class="year-select">
              <option v-for="year in availableYears" :key="year" :value="year">{{ year }}年</option>
            </select>
            <select v-model="selectedMonth" class="month-select">
              <option v-for="month in 12" :key="month" :value="month">{{ month }}月</option>
            </select>
          </div>
        </div>
        <div class="jump-panel-actions">
          <button class="cancel-btn" @click="showJumpPanel = false">取消</button>
          <button class="confirm-btn" @click="handleJumpToDate">跳转</button>
        </div>
      </div>
    </div>

    <div v-if="showProcessingModal" class="processing-modal" @click.self="cancelProcessing">
      <div class="processing-content">
        <h2>{{ processingStatus || '处理中...' }}</h2>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div>
        </div>
        <div class="progress-text">{{ uploadProgress }}%</div>
        <div class="processing-steps">
          <div v-for="(step, idx) in processingSteps" :key="idx" 
               :class="['step', { active: idx === currentStep, done: idx < currentStep }]">
            {{ step }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="displayedGroups.length > 0" @click="onImageClickOutside">
      <div v-for="group in displayedGroups" :key="group.dateKey" :class="['date-group', { highlighted: highlightedGroup === group.dateKey }]" :data-date-key="group.dateKey">
        <div class="date-label" @click="toggleGroup(group)">
          <span class="toggle-arrow" :class="{ collapsed: group.collapsed }">▶</span>
          <span>{{ group.label }}</span>
          <span class="image-count">（{{ group.images.length }} 张）</span>
        </div>
        <div v-if="!group.collapsed" class="images-grid" :style="gridStyle">
          <div 
            v-for="(item) in group.images" 
            :key="item.id" 
            class="image-item"
            @click.stop="openPreview(item)"
            @touchstart="onImageTouchStart($event, item)"
            @touchend="onImageTouchEnd"
            @contextmenu.prevent.stop="onContextMenu($event, item)"
          >
            <img :src="item.ossThumbnailUrl || (item.thumbnail ? '/thumbnails/' + item.thumbnail : '')" :alt="item.originalName" loading="lazy">
            <div v-if="item.mediaType === 'video'" class="video-duration">{{ formatDuration(item.duration) }}</div>
            <button v-if="item.showDeleteBtn" class="inline-delete-btn" @click.stop="confirmDelete(item)">× 删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="!showProcessingModal" class="empty-state">
      <p>还没有照片，快来上传吧！</p>
    </div>

    <div v-if="showPreview" class="preview-modal" @click="closePreview" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd">
      <button class="preview-close" @click="closePreview">&times;</button>
      <button class="preview-nav prev" @click.stop="prevImage" v-if="flattenedImages.length > 1">&lt;</button>
      <div v-if="currentImage?.mediaType === 'video'" class="video-container" @click.stop>
        <div v-if="!isPlaying" class="video-thumb" @click="playVideo">
          <img :src="currentImage?.ossThumbnailUrl || ('/thumbnails/' + currentImage.thumbnail)" :alt="currentImage.originalName">
          <div class="preview-video-duration">{{ formatDuration(currentImage.duration) }}</div>
        </div>
        <video v-else ref="videoPlayer" :src="getVideoSrc(currentImage)" controls autoplay playsinline webkit-playsinline x5-video-player-type="h5" x5-video-player-fullscreen="true" x5-playsinline></video>
      </div>
      <img v-else :src="getImageSrc(currentImage)" :alt="currentImage?.originalName" @click.stop>
      <button class="preview-nav next" @click.stop="nextImage" v-if="flattenedImages.length > 1">&gt;</button>
      <div class="preview-info">
        <span>{{ currentImage?.originalName }}</span>
        <button class="preview-download-btn" @click.stop="downloadItem(currentImage)" title="下载">↓ 下载</button>
        <button class="preview-delete-btn" @click.stop="deleteCurrentItem" title="删除">× 删除</button>
      </div>
    </div>

    <button class="fab-upload" @click="triggerFileInput" title="上传">上传</button>
    <input 
      ref="fileInput" 
      type="file" 
      accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm" 
      multiple 
      @change="handleFileSelect"
      style="display: none"
    >
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

export default {
  name: 'Album',
  setup() {
    const fileInput = ref(null)
    const videoPlayer = ref(null)
    const showProcessingModal = ref(false)
    const processingSteps = ref([])
    const currentStep = ref(0)
    const uploadProgress = ref(0)
    const processingStatus = ref('')
    const images = ref([])
    const showPreview = ref(false)
    const isPlaying = ref(false)
    const previewHistoryPushed = ref(false)
    const currentIndex = ref(0)
    const allGroups = ref([])
    const displayedGroups = ref([])
    const flattenedImages = ref([])
    const hasMore = ref(false)
    const INITIAL_LOAD = 3
    const columnCount = ref(4)
    const touchStartX = ref(0)
    const touchStartY = ref(0)
    const isTouching = ref(false)
    const longPressTimer = ref(null)
    const isLongPress = ref(false)
    const showJumpPanel = ref(false)
    const selectedYear = ref(new Date().getFullYear())
    const selectedMonth = ref(new Date().getMonth() + 1)
    const highlightedGroup = ref(null)
    
    const quickJumpButtons = computed(() => {
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth() + 1
      
      const getDateOffset = (months) => {
        const d = new Date(currentYear, currentMonth - 1 - months, 1)
        return { year: d.getFullYear(), month: d.getMonth() + 1 }
      }
      
      return [
        { label: '1个月前', offset: 1 },
        { label: '3个月前', offset: 3 },
        { label: '6个月前', offset: 6 },
        { label: '1年前', offset: 12 }
      ]
    })
    
    const availableYears = computed(() => {
      const years = new Set()
      const currentYear = new Date().getFullYear()
      years.add(currentYear)
      
      allGroups.value.forEach(group => {
        const year = parseInt(group.dateKey.slice(0, 4))
        years.add(year)
      })
      
      return Array.from(years).sort((a, b) => b - a)
    })
    
    const currentImage = computed(() => {
      return flattenedImages.value[currentIndex.value] || null
    })

    const gridStyle = computed(() => {
      const itemWidth = `calc((100% - ${(columnCount.value - 1) * 15}px) / ${columnCount.value})`
      return {
        gridTemplateColumns: `repeat(${columnCount.value}, ${itemWidth})`
      }
    })

    const getFullImageUrl = (filename) => {
      return `/uploads/${filename}`
    }

    const getImageSrc = (item) => {
      if (!item) return ''
      if (item.ossThumbnailUrl) {
        return item.ossThumbnailUrl
      }
      if (item.thumbnail) {
        return `/thumbnails/${item.thumbnail}`
      }
      return `/uploads/${item.filename}`
    }

    const getVideoSrc = (item) => {
      if (!item) return ''
      if (item.ossCompressedUrl) {
        return item.ossCompressedUrl
      }
      if (item.ossVideoUrl) {
        return item.ossVideoUrl
      }
      return `/videos/${item.filename}`
    }

    const formatDateGroup = (dateStr) => {
      if (dateStr === 'other') return '其他'
      const date = new Date(dateStr.slice(0, 4), dateStr.slice(4, 6) - 1, dateStr.slice(6, 8))
      const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`
    }

    const formatDuration = (seconds) => {
      if (!seconds) return '0:00'
      const m = Math.floor(seconds / 60)
      const s = Math.floor(seconds % 60)
      return `${m}:${s.toString().padStart(2, '0')}`
    }

    const loadImages = async () => {
      try {
        const res = await fetch('/api/album')
        const data = await res.json()
        
        const groups = {}
        for (const item of data) {
          const match = item.filename.match(/^(\d{8})\//)
          const dateKey = match ? match[1] : null
          if (!dateKey) continue
          if (!groups[dateKey]) {
            groups[dateKey] = []
          }
          groups[dateKey].push(item)
        }
        
        const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a))
        
        allGroups.value = sortedKeys.map(key => ({
          dateKey: key,
          label: formatDateGroup(key),
          images: groups[key],
          loaded: false,
          collapsed: false
        }))
        
        displayedGroups.value = allGroups.value.slice(0, INITIAL_LOAD)
        hasMore.value = allGroups.value.length > INITIAL_LOAD
        
        flattenedImages.value = displayedGroups.value.flatMap(g => g.images)
        
        await nextTick()
        handleScroll()
      } catch (err) {
        console.error('加载图片失败:', err)
      }
    }

    const toggleGroup = (group) => {
      group.collapsed = !group.collapsed
    }

    const handleQuickJump = (offsetMonths) => {
      const now = new Date()
      const targetDate = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1)
      const targetYear = targetDate.getFullYear()
      const targetMonth = targetDate.getMonth() + 1
      
      selectedYear.value = targetYear
      selectedMonth.value = targetMonth
      executeJump(targetYear, targetMonth)
    }

    const handleJumpToDate = () => {
      executeJump(selectedYear.value, selectedMonth.value)
    }

    const executeJump = async (year, month) => {
      showJumpPanel.value = false
      
      const targetKey = `${year}${String(month).padStart(2, '0')}`
      
      let targetGroup = allGroups.value.find(g => g.dateKey.startsWith(targetKey))
      
      if (!targetGroup) {
        const allKeys = allGroups.value.map(g => g.dateKey).sort((a, b) => b.localeCompare(a))
        const closestKey = allKeys.find(k => k < targetKey) || allKeys[allKeys.length - 1]
        targetGroup = allGroups.value.find(g => g.dateKey === closestKey)
      }
      
      if (!targetGroup) {
        alert('未找到该日期的照片')
        return
      }
      
      const targetIndex = allGroups.value.indexOf(targetGroup)
      
      const groupsBefore = Math.min(INITIAL_LOAD, targetIndex)
      const start = targetIndex - groupsBefore
      const end = targetIndex + INITIAL_LOAD + 1
      const neededGroups = allGroups.value.slice(start, end)
      
      displayedGroups.value = neededGroups
      hasMore.value = end < allGroups.value.length
      flattenedImages.value = displayedGroups.value.flatMap(g => g.images)
      
      highlightedGroup.value = targetGroup.dateKey
      
      await nextTick()
      
      targetGroup.collapsed = false
      
      await nextTick()
      
      const el = document.querySelector(`.date-group[data-date-key="${targetGroup.dateKey}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        
        setTimeout(() => {
          highlightedGroup.value = null
        }, 2000)
      }
    }

    const loadMore = async () => {
      const lastDisplayedGroup = displayedGroups.value[displayedGroups.value.length - 1]
      const lastIndex = allGroups.value.indexOf(lastDisplayedGroup)
      const nextStart = lastIndex >= 0 ? lastIndex + 1 : displayedGroups.value.length
      const nextGroups = allGroups.value.slice(nextStart, nextStart + INITIAL_LOAD)
      
      displayedGroups.value = [...displayedGroups.value, ...nextGroups]
      hasMore.value = displayedGroups.value.length < allGroups.value.length
      flattenedImages.value = displayedGroups.value.flatMap(g => g.images)
    }

    const triggerFileInput = () => {
      fileInput.value.click()
    }

    const handleFileSelect = (e) => {
      const files = Array.from(e.target.files)
      processFiles(files)
      e.target.value = ''
    }

    const processFiles = async (files) => {
      const validFiles = files.filter(file => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm']
        const maxImageSize = 100 * 1024 * 1024
        const maxVideoSize = 300 * 1024 * 1024
        const isVideo = file.type.startsWith('video/')
        const maxSize = isVideo ? maxVideoSize : maxImageSize
        return allowedTypes.includes(file.type) && file.size <= maxSize
      })

      if (validFiles.length === 0) {
        alert('请上传有效的图片（不超过100MB）或视频（不超过300MB）文件')
        return
      }

      const existingNames = new Set(flattenedImages.value.map(item => item.originalName))
      const newFiles = validFiles.filter(file => !existingNames.has(file.name))

      if (newFiles.length === 0) {
        alert('这些文件已经上传过了')
        return
      }

      if (newFiles.length < validFiles.length) {
        const skipped = validFiles.length - newFiles.length
        alert(`已跳过 ${skipped} 个重复文件`)
      }

      const fileDates = []
      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i]
        const dateDir = extractDateDir(file.name)
        if (dateDir) fileDates.push(dateDir)
        await uploadFileToOSS(file, i + 1, newFiles.length)
      }

      showProcessingModal.value = false
      await loadImages()

      if (fileDates.length > 0) {
        const sortedDates = fileDates.sort((a, b) => b.localeCompare(a))
        const targetDate = sortedDates[0]
        await nextTick()
        const year = parseInt(targetDate.slice(0, 4))
        const month = parseInt(targetDate.slice(4, 6))
        await executeJump(year, month)
      }
    }

    const extractDateDir = (filename) => {
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
      const match = filename.match(/^(?:IMG|VID)[_-](\d{8})/i)
      if (match && looksLikeValidDate(match[1])) return match[1]
      const mmexportMatch = filename.match(/mmexport(\d{13})/i)
      if (mmexportMatch) {
        const timestamp = parseInt(mmexportMatch[1])
        const date = new Date(timestamp)
        return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
      }
      const digits = filename.match(/(\d{8})/)
      if (digits && looksLikeValidDate(digits[1])) return digits[1]
      const now = new Date()
      return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    }

    const uploadFileToOSS = async (file, current, total) => {
      const isVideo = file.type.startsWith('video/')
      
      showProcessingModal.value = true
      uploadProgress.value = 0
      processingStatus.value = `正在上传第 ${current}/${total} 个文件...`
      processingSteps.value = isVideo
        ? ['上传原视频', '生成缩略图', '压缩视频', '获取时长', '保存记录']
        : ['上传图片', '生成缩略图', '保存记录']
      currentStep.value = 0

      try {
        if (!isVideo) {
          // Image: upload directly to local server
          const formData = new FormData()
          formData.append('file', file)

          const uploadPromise = new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open('POST', '/api/album/upload')
            const getCookie = (name) => {
              const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
              return match ? match[2] : null
            }
            const token = getCookie('auth_token')
            if (token) {
              xhr.setRequestHeader('Authorization', token)
            }
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                uploadProgress.value = Math.round((e.loaded / e.total) * 30)
              }
            })
            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                const result = JSON.parse(xhr.responseText)
                resolve(result)
              } else {
                reject(new Error('上传失败'))
              }
            })
            xhr.addEventListener('error', () => reject(new Error('上传失败')))
            xhr.send(formData)
          })

          const uploadResult = await uploadPromise
          currentStep.value = 1
          processingStatus.value = `第 ${current}/${total} 个文件上传成功，正在处理...`

          if (uploadResult.taskId) {
            await pollTaskStatus(uploadResult.taskId)
          }
        } else {
          // Video: upload to OSS first, then process
          const signRes = await fetch('/api/oss/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type,
              fileSize: file.size
            })
          })
          const signResult = await signRes.json()
          if (!signResult.success) {
            throw new Error(signResult.error || '获取签名失败')
          }

          const { uploadUrl, ossPath, dateDir, mediaType, endpoint } = signResult.data

          showProcessingModal.value = true
          uploadProgress.value = 0
          processingStatus.value = `正在上传第 ${current}/${total} 个文件... [${endpoint}]`

          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                uploadProgress.value = Math.round((e.loaded / e.total) * 20)
              }
            })
            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve()
              } else {
                reject(new Error('上传失败'))
              }
            })
            xhr.addEventListener('error', () => reject(new Error('上传失败')))
            xhr.open('PUT', uploadUrl)
            xhr.setRequestHeader('Content-Type', file.type)
            xhr.send(file)
          })

          currentStep.value = 2
          processingStatus.value = `第 ${current}/${total} 个文件上传成功，正在处理... [${endpoint}]`

          const confirmRes = await fetch('/api/album/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ossPath,
              originalName: file.name,
              dateDir,
              mediaType,
              fileSize: file.size
            })
          })
          const confirmResult = await confirmRes.json()
          if (!confirmResult.success) {
            throw new Error(confirmResult.error || '确认上传失败')
          }

          const { taskId } = confirmResult
          await pollTaskStatus(taskId)
        }
      } catch (err) {
        console.error('上传失败:', err)
        alert(`上传第 ${current} 个文件失败：${err.message}`)
        showProcessingModal.value = false
      }
    }

    const pollTaskStatus = async (taskId) => {
      return new Promise((resolve, reject) => {
        const poll = async () => {
          try {
            const res = await fetch(`/api/album/${taskId}/status`)
            const result = await res.json()
            
            if (result.status === 'completed') {
              showProcessingModal.value = false
              resolve()
              return
            }
            
            if (result.status === 'failed') {
              showProcessingModal.value = false
              reject(new Error(result.message || '处理失败'))
              return
            }

            uploadProgress.value = result.progress
            processingStatus.value = result.message

            const stepMap = {
              '正在下载视频': 0,
              '正在生成缩略图': 1,
              '正在上传缩略图': 2,
              '正在压缩视频': 3,
              '正在上传压缩视频': 4,
              '正在获取视频时长': 5,
              '正在保存记录': 6
            }
            for (const [msg, step] of Object.entries(stepMap)) {
              if (result.message.includes(msg)) {
                currentStep.value = step
                break
              }
            }

            setTimeout(poll, 1000)
          } catch (err) {
            reject(err)
          }
        }
        poll()
      })
    }

    const onImageTouchStart = (e, item) => {
      touchStartX.value = e.touches[0].clientX
      touchStartY.value = e.touches[0].clientY
      isLongPress.value = false
      longPressTimer.value = setTimeout(() => {
        isLongPress.value = true
        item.showDeleteBtn = true
      }, 2000)
    }

    const onImageTouchEnd = () => {
      if (longPressTimer.value) {
        clearTimeout(longPressTimer.value)
        longPressTimer.value = null
      }
    }

    const onContextMenu = (e, item) => {
      e.preventDefault()
      item.showDeleteBtn = true
    }

    const confirmDelete = async (item) => {
      if (!item) return
      const result = confirm('确定要删除这个文件吗？')
      item.showDeleteBtn = false
      if (!result) return
      await deleteImage(item.id)
    }

    const hideDeleteBtn = (e) => {
      if (e.key === 'Escape') {
        flattenedImages.value.forEach(img => { img.showDeleteBtn = false })
      }
    }

    const onImageClickOutside = () => {
      flattenedImages.value.forEach(img => { img.showDeleteBtn = false })
    }

    const setupListeners = () => {
      document.addEventListener('keydown', hideDeleteBtn)
    }

    const removeListeners = () => {
      document.removeEventListener('keydown', hideDeleteBtn)
    }

    onMounted(() => {
      setupListeners()
    })

    onUnmounted(() => {
      removeListeners()
    })

    const onTouchStart = (e) => {
      touchStartX.value = e.touches[0].clientX
      touchStartY.value = e.touches[0].clientY
      isTouching.value = true
    }

    const onTouchMove = (e) => {
      if (!isTouching.value) return
    }

    const onTouchEnd = (e) => {
      if (!isTouching.value) return
      isTouching.value = false
      const deltaX = e.changedTouches[0].clientX - touchStartX.value
      const deltaY = e.changedTouches[0].clientY - touchStartY.value
      if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY) * 2) return
      if (deltaX > 0) prevImage()
      else nextImage()
    }

    const stayAtDateAfterDelete = async (deletedItem) => {
      const match = deletedItem.filename.match(/^(\d{8})\//)
      if (!match) return
      const dateKey = match[1]
      const year = parseInt(dateKey.slice(0, 4))
      const month = parseInt(dateKey.slice(4, 6))
      
      await nextTick()
      
      const targetGroup = allGroups.value.find(g => g.dateKey.startsWith(dateKey))
      if (targetGroup) {
        await executeJump(year, month)
      }
    }

    const deleteImage = async (id) => {
      const deletedItem = flattenedImages.value.find(i => i.id === id)
      try {
        const res = await fetch(`/api/album/${id}`, {
          method: 'DELETE'
        })
        const result = await res.json()
        if (result.success) {
          await loadImages()
          if (deletedItem) await stayAtDateAfterDelete(deletedItem)
        } else {
          alert(result.error || '删除失败')
        }
      } catch (err) {
        console.error('删除失败:', err)
        alert('删除失败，请重试')
      }
    }

    const downloadItem = async (item) => {
      if (!item) return
      try {
        if (item.mediaType === 'image' && item.filename) {
          const link = document.createElement('a')
          link.href = `/uploads/${item.filename}`
          link.download = item.originalName
          link.click()
        } else if (item.mediaType === 'video') {
          const res = await fetch(`/api/album/${item.id}/download`)
          const result = await res.json()
          if (result.downloadUrl) {
            const link = document.createElement('a')
            link.href = result.downloadUrl
            link.download = item.originalName
            link.click()
          }
        }
      } catch (err) {
        console.error('下载失败:', err)
      }
    }

    const deleteItemFromPreview = async (item) => {
      if (!item || !confirm('确定要删除这个文件吗？')) return
      try {
        const res = await fetch(`/api/album/${item.id}`, {
          method: 'DELETE'
        })
        const result = await res.json()
        if (result.success) {
          closePreview()
          await loadImages()
          await stayAtDateAfterDelete(item)
        } else {
          alert(result.error || '删除失败')
          return
        }
      } catch (err) {
        console.error('删除失败:', err)
        alert('删除失败，请重试')
        return
      }
      closePreview()
      await loadImages()
      await stayAtDateAfterDelete(item)
    }

    const deleteCurrentItem = async () => {
      const item = flattenedImages.value[currentIndex.value]
      if (!item) return
      if (!confirm('确定要删除这个文件吗？')) return
      try {
        const res = await fetch(`/api/album/${item.id}`, {
          method: 'DELETE'
        })
        const result = await res.json()
        if (result.success) {
          if (showPreview.value) closePreview()
          await loadImages()
          await stayAtDateAfterDelete(item)
        } else {
          alert(result.error || '删除失败')
        }
      } catch (err) {
        console.error('删除失败:', err)
        alert('删除失败，请重试')
      }
    }

    const openPreview = (item) => {
      const index = flattenedImages.value.findIndex(i => i.id === item.id)
      currentIndex.value = index >= 0 ? index : 0
      isPlaying.value = item.mediaType === 'video'
      showPreview.value = true
      if (!previewHistoryPushed.value) {
        previewHistoryPushed.value = true
        history.pushState({ preview: true }, '')
      }
      if (item.mediaType === 'video') {
        nextTick(() => {
          if (videoPlayer.value) {
            const w = window.innerWidth
            const h = window.innerHeight
            videoPlayer.value.style.width = w + 'px'
            videoPlayer.value.style.height = h + 'px'
            videoPlayer.value.style.objectFit = 'cover'
            videoPlayer.value.style.display = 'block'
            videoPlayer.value.play()
          }
        })
      }
    }

    const closePreview = (fromPopstate = false) => {
      isPlaying.value = false
      showPreview.value = false
      if (!fromPopstate) {
        history.go(-1)
      }
      previewHistoryPushed.value = false
    }

    const playVideo = () => {
      isPlaying.value = true
      nextTick(() => {
        if (videoPlayer.value) {
          const w = window.innerWidth
          const h = window.innerHeight
          videoPlayer.value.style.width = w + 'px'
          videoPlayer.value.style.height = h + 'px'
          videoPlayer.value.style.objectFit = 'cover'
          videoPlayer.value.style.display = 'block'
        }
      })
    }

    const prevImage = () => {
      currentIndex.value = (currentIndex.value - 1 + flattenedImages.value.length) % flattenedImages.value.length
    }

    const nextImage = () => {
      currentIndex.value = (currentIndex.value + 1) % flattenedImages.value.length
    }

    const handleKeydown = (e) => {
      if (!showPreview.value) return
      if (e.key === 'Escape') closePreview(false)
      if (e.key === 'ArrowLeft') prevImage()
      if (e.key === 'ArrowRight') nextImage()
    }

    const handlePopstate = () => {
      if (showPreview.value) {
        closePreview(true)
      }
    }

    onMounted(() => {
      loadImages()
      window.addEventListener('keydown', handleKeydown)
      window.addEventListener('scroll', handleScroll)
      window.addEventListener('popstate', handlePopstate)
    })

    onUnmounted(() => {
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('popstate', handlePopstate)
    })

    const handleScroll = () => {
      if (hasMore.value) {
        const scrollTop = window.scrollY || document.documentElement.scrollTop
        const clientHeight = document.documentElement.clientHeight
        const scrollHeight = document.documentElement.scrollHeight
        
        if (scrollTop + clientHeight >= scrollHeight - 200) {
          loadMore()
        }
      }
    }

    return {
      fileInput,
      videoPlayer,
      uploadProgress,
      processingStatus,
      showProcessingModal,
      processingSteps,
      currentStep,
      images,
      displayedGroups,
      flattenedImages,
      hasMore,
      showPreview,
      isPlaying,
      currentIndex,
      currentImage,
      columnCount,
      getFullImageUrl,
      gridStyle,
      triggerFileInput,
      handleFileSelect,
      deleteImage,
      downloadItem,
      deleteItemFromPreview,
      deleteCurrentItem,
      getVideoSrc,
      getImageSrc,
      openPreview,
      closePreview,
      playVideo,
      prevImage,
      nextImage,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onImageTouchStart,
      onImageTouchEnd,
      onContextMenu,
      confirmDelete,
      onImageClickOutside,
      hideDeleteBtn,
      loadMore,
      formatDuration,
      toggleGroup,
      showJumpPanel,
      quickJumpButtons,
      availableYears,
      selectedYear,
      selectedMonth,
      handleQuickJump,
      handleJumpToDate
    }
  }
}
</script>

<style scoped>
.album-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.album-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 20px;
  position: sticky;
  top: 0;
  z-index: 100;
  background: white;
  padding: 10px 0;
}

.album-header h1 {
  flex: 1;
  background: linear-gradient(135deg, #85c285, #5b9bd5);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.fab-upload {
  position: fixed;
  bottom: 60px;
  right: 20px;
  border-radius: 10px;
  background: rgba(133, 194, 133, 0.85);
  color: white;
  border: none;
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(133, 194, 133, 0.5);
  transition: all 0.3s;
  z-index: 500;
  padding: 12px 18px;
  font-weight: 600;
}

.fab-upload:hover {
  background: rgba(107, 179, 107, 0.95);
  transform: translateY(-2px);
}

.fab-upload:active {
  transform: translateY(0);
}

.loading {
  text-align: center;
  padding: 20px;
  color: #5b9bd5;
}

.jump-btn {
  padding: 5px 12px;
  border: 1px solid #85c285;
  background: linear-gradient(135deg, #85c285, #6bb36b);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s;
  white-space: nowrap;
}

.jump-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(133, 194, 133, 0.4);
}

.jump-btn:active {
  transform: translateY(0);
}

.jump-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  animation: fadeInOverlay 0.2s ease;
}

@keyframes fadeInOverlay {
  from { opacity: 0; }
  to { opacity: 1; }
}

.jump-panel {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.jump-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.jump-panel-header h3 {
  margin: 0;
  font-size: 17px;
  color: #333;
  font-weight: 600;
}

.close-panel-btn {
  background: none;
  border: none;
  font-size: 26px;
  color: #999;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color 0.2s;
}

.close-panel-btn:hover {
  color: #333;
}

.jump-panel-section {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.section-label {
  font-size: 13px;
  color: #666;
  margin-bottom: 10px;
  font-weight: 500;
}

.quick-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.quick-buttons button {
  padding: 10px 15px;
  border: 1px solid #e0e0e0;
  background: #f8f9fa;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #333;
  transition: all 0.2s;
}

.quick-buttons button:hover {
  background: linear-gradient(135deg, #85c285, #6bb36b);
  color: white;
  border-color: #85c285;
}

.quick-buttons button:active {
  transform: scale(0.98);
}

.date-selectors {
  display: flex;
  gap: 12px;
}

.year-select,
.month-select {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  color: #333;
  background: #f8f9fa;
  cursor: pointer;
  transition: border-color 0.2s;
}

.year-select:focus,
.month-select:focus {
  outline: none;
  border-color: #85c285;
}

.jump-panel-actions {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
}

.jump-panel-actions button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background: #f0f0f0;
  color: #666;
}

.cancel-btn:hover {
  background: #e0e0e0;
}

.confirm-btn {
  background: linear-gradient(135deg, #85c285, #6bb36b);
  color: white;
}

.confirm-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(133, 194, 133, 0.4);
}

.confirm-btn:active {
  transform: translateY(0);
}

.date-group {
  margin-bottom: 30px;
  transition: background-color 0.3s;
  border-radius: 8px;
  padding: 8px;
}

.date-group.highlighted {
  background-color: rgba(133, 194, 133, 0.15);
  animation: highlightPulse 2s ease;
}

@keyframes highlightPulse {
  0%, 100% { background-color: rgba(133, 194, 133, 0.15); }
  50% { background-color: rgba(133, 194, 133, 0.3); }
}

.column-control {
  display: flex;
  gap: 5px;
  justify-content: flex-end;
}

.column-control button {
  padding: 4px 10px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #666;
}

.column-control button.active {
  background: linear-gradient(135deg, #85c285, #6bb36b);
  color: white;
  border-color: #85c285;
}

.upload-status {
  margin-bottom: 10px;
  font-size: 14px;
}

.progress-bar {
  width: 100%;
  max-width: 300px;
  height: 10px;
  background: #e0e0e0;
  border-radius: 5px;
  margin: 0 auto 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(135deg, #85c285, #6bb36b);
  transition: width 0.2s;
}

.progress-text {
  font-size: 12px;
  color: #666;
  margin-top: 5px;
}

.processing-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.processing-content {
  background: white;
  padding: 30px;
  border-radius: 12px;
  width: 360px;
  min-height: 280px;
  text-align: center;
}

.processing-content h2 {
  margin: 0 0 20px;
  color: #333;
  font-size: 15px;
  line-height: 1.5;
  word-break: break-all;
  white-space: normal;
  min-height: 45px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.processing-content .progress-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  margin-bottom: 8px;
}

.processing-content .progress-fill {
  height: 100%;
  background: linear-gradient(135deg, #85c285, #5b9bd5);
  border-radius: 4px;
  transition: width 0.3s;
}

.processing-content .progress-text {
  font-size: 14px;
  color: #666;
  margin-bottom: 20px;
}

.processing-steps {
  text-align: left;
  display: inline-block;
}

.processing-steps .step {
  padding: 6px 0;
  color: #ccc;
  font-size: 13px;
  display: flex;
  align-items: center;
}

.processing-steps .step::before {
  content: '○';
  margin-right: 8px;
  font-size: 14px;
}

.processing-steps .step.active {
  color: #5b9bd5;
  font-weight: 600;
}

.processing-steps .step.active::before {
  content: '◉';
  animation: pulse 1s infinite;
}

.processing-steps .step.done {
  color: #85c285;
}

.processing-steps .step.done::before {
  content: '✓';
  font-weight: bold;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.date-group {
  margin-bottom: 30px;
}

.date-label {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  padding: 8px 0 4px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.2s;
}

.date-label:hover {
  opacity: 0.7;
}

.toggle-arrow {
  display: inline-block;
  transition: transform 0.25s;
  font-size: 10px;
  color: #999;
}

.toggle-arrow.collapsed {
  transform: rotate(90deg);
}

.image-count {
  font-weight: 400;
  color: #999;
  font-size: 13px;
}

.images-grid {
  display: grid;
  gap: 3px;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.3s;
}

.image-item:hover {
  transform: scale(1.02);
}

.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-item .inline-delete-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 107, 107, 0.9);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
  z-index: 10;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

.image-item .video-duration {
  position: absolute;
  bottom: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}


.empty-state {
  text-align: center;
  padding: 60px;
  color: #999;
}

.preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.preview-modal img {
  max-width: 90%;
  max-height: 85vh;
  object-fit: contain;
}

.preview-modal video {
  max-width: 90%;
  max-height: 85vh;
  object-fit: contain;
}

.video-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.video-container video {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.video-thumb {
  position: relative;
  cursor: pointer;
}

.video-thumb img {
  max-width: 90%;
  max-height: 85vh;
  object-fit: contain;
}

.video-thumb .play-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border-radius: 50%;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
}

.video-thumb .play-btn:hover {
  background: rgba(0, 0, 0, 0.85);
}

.video-thumb .preview-video-duration {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
}

.preview-close {
  position: absolute;
  top: 20px;
  right: 30px;
  background: none;
  border: none;
  color: white;
  font-size: 40px;
  cursor: pointer;
}

.preview-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  font-size: 30px;
  padding: 15px 20px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.3s;
}

.preview-nav:hover {
  background: rgba(255, 255, 255, 0.4);
}

.preview-nav.prev {
  left: 20px;
}

.preview-nav.next {
  right: 20px;
}

.preview-info {
  position: absolute;
  bottom: 20px;
  color: white;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 15px;
  z-index: 1002;
}

.preview-download-btn {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.3s;
}

.preview-download-btn:hover {
  background: rgba(255, 255, 255, 0.4);
}

.preview-delete-btn {
  background: rgba(255, 107, 107, 0.6);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.3s;
}

.preview-delete-btn:hover {
  background: rgba(255, 107, 107, 0.9);
}

@media (max-width: 768px) {
  .album-view {
    padding: 15px;
  }

  .album-header {
    margin-bottom: 20px;
  }

  .album-header h1 {
    flex: 1;
    font-size: 18px;
  }

  .jump-btn {
    padding: 5px 10px;
    font-size: 12px;
  }

  .images-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }

  .preview-nav {
    padding: 10px 15px;
    font-size: 24px;
  }

  .preview-nav.prev {
    left: 10px;
  }

  .preview-nav.next {
    right: 10px;
  }

  .preview-modal video {
    display: block !important;
    width: 100vw !important;
    height: 100vh !important;
    object-fit: cover !important;
  }

  .video-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1001;
  }

  .video-container video {
    display: block !important;
    width: 100vw !important;
    height: 100vh !important;
    object-fit: cover !important;
  }

  .video-thumb {
    width: 100%;
  }

  .video-thumb img {
    max-width: 100%;
    max-height: 85vh;
    width: 100%;
    object-fit: contain;
  }

  .preview-info {
    flex-wrap: wrap;
    justify-content: center;
    bottom: 15px;
    padding: 0 15px;
    font-size: 12px;
    gap: 20px;
    width: 100%;
  }

  .preview-download-btn {
    padding: 10px 20px;
    font-size: 15px;
    min-width: 80px;
  }

  .preview-delete-btn {
    padding: 10px 20px;
    font-size: 15px;
    min-width: 80px;
  }
}
</style>
