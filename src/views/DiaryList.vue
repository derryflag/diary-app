<template>
  <div class="diary-list">
    <div class="list-header">
      <h1>我的日记</h1>
      <router-link to="/diary/new" class="new-diary-btn">写新日记</router-link>
    </div>
    
    <div v-if="diaries.length === 0" class="empty-state">
      <p>还没有日记，开始记录你的第一篇日记吧！</p>
      <router-link to="/diary/new" class="btn primary">写第一篇日记</router-link>
    </div>
    
    <div v-else class="diaries">
      <div v-for="diary in diaries" :key="diary.id" class="diary-card">
        <div class="diary-header">
          <h3>{{ diary.title }}</h3>
          <span class="date">{{ formatDate(diary.date) }}</span>
        </div>
        <div class="diary-preview">
          <p>{{ diary.content.substring(0, 150) }}...</p>
        </div>
        <div class="diary-actions">
          <router-link :to="'/diary/' + diary.id" class="read-btn">阅读全文</router-link>
          <router-link :to="'/diary/edit/' + diary.id" class="edit-btn">编辑</router-link>
          <button @click="deleteDiary(diary.id)" class="delete-btn">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

export default {
  name: 'DiaryList',
  setup() {
    const router = useRouter()
    const diaries = ref([])
    
    const loadDiaries = () => {
      // 从 localStorage 加载日记数据
      const savedDiaries = JSON.parse(localStorage.getItem('diaries') || '[]')
      // 按日期排序，最新的在前
      savedDiaries.sort((a, b) => new Date(b.date) - new Date(a.date))
      diaries.value = savedDiaries
    }
    
    const formatDate = (dateString) => {
      const options = { year: 'numeric', month: 'long', day: 'numeric' }
      return new Date(dateString).toLocaleDateString('zh-CN', options)
    }
    
    const deleteDiary = (id) => {
      if (confirm('确定要删除这篇日记吗？')) {
        const updatedDiaries = diaries.value.filter(d => d.id !== id)
        localStorage.setItem('diaries', JSON.stringify(updatedDiaries))
        loadDiaries()
      }
    }
    
    onMounted(() => {
      loadDiaries()
    })
    
    return {
      diaries,
      formatDate,
      deleteDiary
    }
  }
}
</script>

<style scoped>
.diary-list {
  max-width: 800px;
  margin: 0 auto;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  border-bottom: 1px solid #eee;
  padding-bottom: 15px;
}

.list-header h1 {
  color: #42b983;
  margin: 0;
}

.new-diary-btn {
  background-color: #42b983;
  color: white;
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 4px;
  font-weight: bold;
  transition: background-color 0.3s;
}

.new-diary-btn:hover {
  background-color: #3aa876;
}

.empty-state {
  text-align: center;
  padding: 50px 0;
}

.empty-state p {
  color: #666;
  margin-bottom: 20px;
  font-size: 18px;
}

.btn {
  display: inline-block;
  padding: 10px 20px;
  text-decoration: none;
  border-radius: 4px;
  background-color: #f0f0f0;
  color: #333;
  transition: all 0.3s;
}

.btn.primary {
  background-color: #42b983;
  color: white;
}

.btn.primary:hover {
  background-color: #3aa876;
}

.diaries {
  display: grid;
  gap: 20px;
}

.diary-card {
  background: #f9f9f9;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s;
}

.diary-card:hover {
  transform: translateY(-3px);
}

.diary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.diary-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 20px;
}

.date {
  color: #888;
  font-size: 14px;
}

.diary-preview p {
  color: #666;
  margin: 0 0 15px 0;
  line-height: 1.5;
}

.diary-actions {
  display: flex;
  gap: 10px;
}

.read-btn, .edit-btn {
  display: inline-block;
  padding: 6px 12px;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.3s;
}

.read-btn {
  background-color: #42b983;
  color: white;
}

.read-btn:hover {
  background-color: #3aa876;
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
  padding: 6px 12px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.delete-btn:hover {
  background: #c0392b;
}
</style>