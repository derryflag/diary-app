<template>
  <div class="new-diary">
    <h1>写日记</h1>
    
    <form @submit.prevent="saveDiary" class="diary-form">
      <div class="form-group">
        <label for="title">标题</label>
        <input 
          type="text" 
          id="title" 
          v-model="diary.title" 
          placeholder="给今天起个标题..."
          required
        />
      </div>
      
      <div class="form-group">
        <label for="date">日期</label>
        <input 
          type="date" 
          id="date" 
          v-model="diary.date"
          required
        />
      </div>
      
      <div class="form-group">
        <label for="content">内容</label>
        <textarea 
          id="content" 
          v-model="diary.content" 
          placeholder="记录今天发生的事情..."
          rows="15"
          required
        ></textarea>
      </div>
      
      <div class="form-actions">
        <button type="submit" class="save-btn">保存日记</button>
        <router-link to="/diary" class="cancel-btn">取消</router-link>
      </div>
    </form>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

export default {
  name: 'NewDiary',
  setup() {
    const router = useRouter()
    const diary = ref({
      title: '',
      date: new Date().toISOString().split('T')[0], // 默认为今天
      content: ''
    })
    
    const saveDiary = () => {
      // 生成唯一ID
      const id = Date.now().toString()
      
      // 创建新日记对象
      const newDiary = {
        id,
        ...diary.value
      }
      
      // 获取现有日记
      const existingDiaries = JSON.parse(localStorage.getItem('diaries') || '[]')
      
      // 添加新日记
      existingDiaries.push(newDiary)
      
      // 保存到localStorage
      localStorage.setItem('diaries', JSON.stringify(existingDiaries))
      
      // 跳转到日记详情页
      router.push(`/diary/${id}`)
    }
    
    onMounted(() => {
      // 设置默认日期为今天
      diary.value.date = new Date().toISOString().split('T')[0]
    })
    
    return {
      diary,
      saveDiary
    }
  }
}
</script>

<style scoped>
.new-diary {
  max-width: 800px;
  margin: 0 auto;
}

h1 {
  color: #42b983;
  text-align: center;
  margin-bottom: 30px;
}

.diary-form {
  background: #f9f9f9;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
  color: #2c3e50;
}

input[type="text"],
input[type="date"],
textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
  font-family: inherit;
  box-sizing: border-box;
}

textarea {
  resize: vertical;
  min-height: 300px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 15px;
  margin-top: 30px;
}

.save-btn {
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.save-btn:hover {
  background-color: #3aa876;
}

.cancel-btn {
  display: inline-block;
  padding: 10px 20px;
  background-color: #f0f0f0;
  color: #333;
  text-decoration: none;
  border-radius: 4px;
  font-size: 16px;
  transition: background-color 0.3s;
}

.cancel-btn:hover {
  background-color: #e0e0e0;
}
</style>
