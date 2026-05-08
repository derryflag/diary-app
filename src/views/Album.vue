<template>
  <div class="album-view">
    <div class="album-header">
      <button @click="goBack" class="back-btn">去日记</button>
      <h1>灰兔相册</h1>
      <button @click="triggerFileInput" class="upload-btn">上传</button>
      <input 
        ref="fileInput" 
        type="file" 
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm" 
        multiple 
        @change="handleFileSelect"
        style="display: none"
      >
    </div>

    <div v-if="isUploading" class="loading">
      上传中...
    </div>

    <div v-if="displayedGroups.length > 0">
      <div v-for="group in displayedGroups" :key="group.dateKey" class="date-group">
        <div class="date-label">{{ group.label }}</div>
        <div class="images-grid">
          <div 
            v-for="(item) in group.images" 
            :key="item.id" 
            class="image-item"
            @click="openPreview(item)"
          >
            <img :src="item.thumbnail ? '/thumbnails/' + item.thumbnail : getFullImageUrl(item.filename)" :alt="item.originalName" loading="lazy">
            <div v-if="item.mediaType === 'video'" class="video-indicator">▶</div>
            <button class="delete-btn" @click.stop="deleteImage(item.id)">&times;</button>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="!isUploading" class="empty-state">
      <p>还没有照片，快来上传吧！</p>
    </div>

    <div v-if="showPreview" class="preview-modal" @click="closePreview">
      <button class="preview-close" @click="closePreview">&times;</button>
      <button class="preview-nav prev" @click.stop="prevImage" v-if="flattenedImages.length > 1">&lt;</button>
      <div v-if="currentImage?.mediaType === 'video'" class="video-container" @click.stop>
        <video :src="'/uploads/' + currentImage.filename" controls autoplay></video>
      </div>
      <img v-else :src="currentImage?.thumbnail ? '/thumbnails/' + currentImage.thumbnail : getFullImageUrl(currentImage?.filename)" :alt="currentImage?.originalName" @click.stop>
      <button class="preview-nav next" @click.stop="nextImage" v-if="flattenedImages.length > 1">&gt;</button>
      <div class="preview-info">
        <span>{{ currentImage?.originalName }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

export default {
  name: 'Album',
  setup() {
    const router = useRouter()
    const fileInput = ref(null)
    const isUploading = ref(false)
    const images = ref([])
    const showPreview = ref(false)
    const currentIndex = ref(0)
    const allGroups = ref([])
    const displayedGroups = ref([])
    const flattenedImages = ref([])
    const hasMore = ref(false)
    const INITIAL_LOAD = 3
    
    const currentImage = computed(() => {
      return flattenedImages.value[currentIndex.value] || null
    })

    const goBack = () => {
      router.push('/')
    }

    const getFullImageUrl = (filename) => {
      return `/uploads/${filename}`
    }

    const formatDateGroup = (dateStr) => {
      if (dateStr === 'other') return '其他'
      const date = new Date(dateStr.slice(0, 4), dateStr.slice(4, 6) - 1, dateStr.slice(6, 8))
      const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`
    }

    const loadImages = async () => {
      try {
        const res = await fetch('/api/album')
        const data = await res.json()
        
        const groups = {}
        for (const item of data) {
          const match = item.filename.match(/^(\d{8})\//)
          const dateKey = match ? match[1] : 'other'
          if (!groups[dateKey]) {
            groups[dateKey] = []
          }
          groups[dateKey].push(item)
        }
        
        const sortedKeys = Object.keys(groups).sort((a, b) => {
          if (a === 'other') return 1
          if (b === 'other') return -1
          return b.localeCompare(a)
        })
        
        allGroups.value = sortedKeys.map(key => ({
          dateKey: key,
          label: formatDateGroup(key),
          images: groups[key],
          loaded: false
        }))
        
        displayedGroups.value = allGroups.value.slice(0, INITIAL_LOAD)
        hasMore.value = allGroups.value.length > INITIAL_LOAD
        
        flattenedImages.value = displayedGroups.value.flatMap(g => g.images)
      } catch (err) {
        console.error('加载图片失败:', err)
      }
    }

    const loadMore = async () => {
      const currentLength = displayedGroups.value.length
      const nextGroups = allGroups.value.slice(currentLength, currentLength + INITIAL_LOAD)
      
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
        const maxSize = 100 * 1024 * 1024
        return allowedTypes.includes(file.type) && file.size <= maxSize
      })

      if (validFiles.length === 0) {
        alert('请上传有效的图片或视频文件，大小不超过100MB')
        return
      }

      isUploading.value = true

      for (const file of validFiles) {
        const formData = new FormData()
        formData.append('media', file)

        try {
          const res = await fetch('/api/album', {
            method: 'POST',
            body: formData
          })
          const result = await res.json()
          if (result.success) {
          }
        } catch (err) {
          console.error('上传失败:', err)
          alert('上传失败，请重试')
        }
      }

      await loadImages()
      isUploading.value = false
    }

    const deleteImage = async (id) => {
      if (!confirm('确定要删除这个文件吗？')) return

      try {
        const res = await fetch(`/api/album/${id}`, {
          method: 'DELETE'
        })
        const result = await res.json()
        if (result.success) {
          await loadImages()
        }
      } catch (err) {
        console.error('删除失败:', err)
        alert('删除失败，请重试')
      }
    }

    const openPreview = (item) => {
      const index = flattenedImages.value.findIndex(i => i.id === item.id)
      currentIndex.value = index >= 0 ? index : 0
      showPreview.value = true
    }

    const closePreview = () => {
      showPreview.value = false
    }

    const prevImage = () => {
      currentIndex.value = (currentIndex.value - 1 + flattenedImages.value.length) % flattenedImages.value.length
    }

    const nextImage = () => {
      currentIndex.value = (currentIndex.value + 1) % flattenedImages.value.length
    }

    const handleKeydown = (e) => {
      if (!showPreview.value) return
      if (e.key === 'Escape') closePreview()
      if (e.key === 'ArrowLeft') prevImage()
      if (e.key === 'ArrowRight') nextImage()
    }

    onMounted(() => {
      loadImages()
      window.addEventListener('keydown', handleKeydown)
      window.addEventListener('scroll', handleScroll)
    })

    onUnmounted(() => {
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('scroll', handleScroll)
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
      router,
      fileInput,
      isUploading,
      images,
      displayedGroups,
      flattenedImages,
      hasMore,
      showPreview,
      currentIndex,
      currentImage,
      goBack,
      getFullImageUrl,
      triggerFileInput,
      handleFileSelect,
      deleteImage,
      openPreview,
      closePreview,
      prevImage,
      nextImage,
      loadMore
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
  justify-content: flex-start;
  gap: 15px;
  margin-bottom: 30px;
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

.upload-btn {
  background: linear-gradient(135deg, #85c285, #6bb36b);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 20px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.upload-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(133, 194, 133, 0.4);
}

.back-btn {
  background: linear-gradient(135deg, #85c285, #6bb36b);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.back-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(133, 194, 133, 0.4);
}

.loading {
  text-align: center;
  padding: 20px;
  color: #5b9bd5;
}

.date-group {
  margin-bottom: 30px;
}

.date-label {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  padding: 10px 0;
  border-bottom: 2px solid #e0e0e0;
  margin-bottom: 15px;
}

.images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 15px;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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

.image-item .video-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.image-item .delete-btn {
  position: absolute;
  top: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.3s;
}

.image-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #ff6b6b;
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
}

@media (max-width: 768px) {
  .album-view {
    padding: 15px;
  }

  .album-header {
    margin-bottom: 20px;
    justify-content: flex-start;
  }

  .album-header h1 {
    flex: 1;
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
}
</style>
