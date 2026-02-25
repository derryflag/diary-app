<template>
  <div class="diary-detail" v-if="diary">
    <div class="diary-header">
      <h1>{{ diary.title }}</h1>
      <div class="diary-meta">
        <span class="date">{{ formatDate(diary.date) }}</span>
        <div class="actions">
          <router-link to="/diary" class="back-btn">返回列表</router-link>
          <router-link :to="'/diary/edit/' + diary.id" class="edit-btn">编辑</router-link>
          <button @click="deleteDiary" class="delete-btn">删除</button>
        </div>
      </div>
    </div>
    
    <div class="diary-content">
      <div class="content-text" v-html="formattedContent"></div>
    </div>
  </div>
  
  <div v-else class="not-found">
    <h1>日记不存在</h1>
    <p>抱歉，您要查看的日记不存在或已被删除。</p>
    <router-link to="/diary" class="back-btn">返回日记列表</router-link>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export default {
  name: 'DiaryDetail',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const diary = ref(null)
    
    const loadDiary = () => {
      const diaryId = route.params.id
      const diaries = JSON.parse(localStorage.getItem('diaries') || '[]')
      diary.value = diaries.find(d => d.id === diaryId)
    }
    
    const formatDate = (dateString) => {
      const options = { year: 'numeric', month: 'long', day: 'numeric' }
      return new Date(dateString).toLocaleDateString('zh-CN', options)
    }
    
    const formattedContent = computed(() => {
      if (!diary.value) return ''
      // 简单的换行转换
      return diary.value.content.replace(/\n/g, '<br>')
    })
    
    const deleteDiary = () => {
      if (confirm('确定要删除这篇日记吗？')) {
        const diaries = JSON.parse(localStorage.getItem('diaries') || '[]')
        const updatedDiaries = diaries.filter(d => d.id !== diary.value.id)
        localStorage.setItem('diaries', JSON.stringify(updatedDiaries))
        router.push('/diary')
      }
    }
    
    onMounted(() => {
      loadDiary()
    })
    
    return {
      diary,
      formatDate,
      formattedContent,
      deleteDiary
    }
  }
}
</script>

<style scoped>
.diary-detail {
  max-width: 800px;
  margin: 0 auto;
}

.diary-header {
  margin-bottom: 30px;
  border-bottom: 1px solid #eee;
  padding-bottom: 20px;
}

.diary-header h1 {
  color: #2c3e50;
  margin-top: 0;
  margin-bottom: 10px;
}

.diary-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.date {
  color: #888;
  font-size: 16px;
}

.actions {
  display: flex;
  gap: 10px;
}

.back-btn, .edit-btn {
  display: inline-block;
  padding: 8px 16px;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.3s;
}

.back-btn {
  background-color: #f0f0f0;
  color: #333;
}

.back-btn:hover {
  background-color: #e0e0e0;
}

.edit-btn {
  background-color: #3498db;
  color: white;
}

.edit-btn:hover {
  background-color: #2980b9;
}

.delete-btn {
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.delete-btn:hover {
  background: #c0392b;
}

.diary-content {
  line-height: 1.8;
  font-size: 18px;
  color: #333;
}

.content-text {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.not-found {
  text-align: center;
  padding: 50px 0;
}

.not-found h1 {
  color: #e74c3c;
  margin-bottom: 20px;
}

.not-found p {
  color: #666;
  margin-bottom: 30px;
}
</style>
