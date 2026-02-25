<template>
  <div class="calendar-view">
    <div class="calendar-header">
      <h1>我的日记本</h1>
      <div class="month-navigation">
        <button @click="previousMonth" class="nav-btn">&lt;</button>
        <h2>{{ currentMonthYear }}</h2>
        <button @click="nextMonth" class="nav-btn">&gt;</button>
      </div>
    </div>
    
    <div class="calendar">
      <div class="weekdays">
        <div v-for="day in weekdays" :key="day" class="weekday">{{ day }}</div>
      </div>
      <div class="days-grid">
        <div 
          v-for="day in calendarDays" 
          :key="day.date" 
          class="day"
          :class="{ 
            'other-month': !day.isCurrentMonth,
            'today': isToday(day.date),
            'has-diary': hasDiary(day.date)
          }"
          @click="handleDayClick(day)"
        >
          <div class="day-number">{{ day.dayOfMonth }}</div>
          <div v-if="hasDiary(day.date)" class="diary-preview">
            <div class="diary-snippet">{{ getDiarySnippet(day.date) }}</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 查看日记模态框 -->
    <div v-if="selectedDayDiary && !isEditMode" class="diary-modal" @click.self="closeDiaryModal">
      <div class="diary-content">
        <div class="modal-header">
          <h3>{{ formatDate(selectedDayDiary.date) }}</h3>
          <button @click="closeDiaryModal" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="diary-content-text">{{ selectedDayDiary.content }}</div>
        </div>
        <div class="modal-actions">
          <button @click="enterEditMode" class="edit-btn">编辑</button>
          <button @click="deleteDiary" class="delete-btn">删除</button>
        </div>
      </div>
    </div>
    
    <!-- 写/编辑日记模态框 -->
    <div v-if="isEditMode" class="diary-modal" @click.self="closeDiaryModal">
      <div class="diary-form-content">
        <div class="modal-header">
          <h3>{{ selectedDayDiary ? '编辑日记' : '写日记' }}</h3>
          <span class="diary-date">{{ formatDate(selectedDate) }}</span>
          <button @click="closeDiaryModal" class="close-btn">&times;</button>
        </div>
        <form @submit.prevent="saveDiary" class="diary-form">
          <div class="form-group">
            <label for="content">内容</label>
            <textarea 
              id="content" 
              v-model="diaryForm.content" 
              placeholder="记录今天发生的事情..."
              rows="10"
              required
            ></textarea>
          </div>
          
          <div class="form-actions">
            <button type="submit" class="save-btn">保存</button>
            <button type="button" @click="closeDiaryModal" class="cancel-btn">取消</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'

export default {
  name: 'Home',
  setup() {
    const currentDate = ref(new Date())
    const diaries = ref([])
    const selectedDayDiary = ref(null)
    const selectedDate = ref(null)
    const isEditMode = ref(false)
    const diaryForm = ref({
      content: ''
    })
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    
    // 初始化示例日记数据
    const initSampleDiaries = () => {
      const today = new Date()
      const sampleDiaries = [
        {
          id: '1',
          date: new Date(today.getFullYear(), today.getMonth(), 5).toISOString().split('T')[0],
          content: '今天天气真好，阳光明媚。公园里的花都开了，粉色的樱花特别美。和朋友们一起野餐，聊了很多有趣的话题。晚上回家时心情特别好。'
        },
        {
          id: '2',
          date: new Date(today.getFullYear(), today.getMonth(), 8).toISOString().split('T')[0],
          content: '今天完成了一个重要的项目，得到了老板的表扬。同事们都为我感到高兴，一起去了庆祝晚餐。虽然很累，但是很有成就感。'
        },
        {
          id: '3',
          date: new Date(today.getFullYear(), today.getMonth(), 12).toISOString().split('T')[0],
          content: '外面下着小雨，适合在家读书。泡了一杯热茶，窝在沙发里看了一下午小说。雨声和书页翻动的声音很治愈。'
        },
        {
          id: '4',
          date: new Date(today.getFullYear(), today.getMonth(), 15).toISOString().split('T')[0],
          content: '尝试做了新的蛋糕配方，虽然样子不太完美，但味道还不错。家人都很喜欢，下次可以再改进一下。厨房里充满了甜甜的香味。'
        },
        {
          id: '5',
          date: new Date(today.getFullYear(), today.getMonth(), 18).toISOString().split('T')[0],
          content: '晚上和朋友去山顶看城市夜景，灯火辉煌特别美。聊了很多关于未来的计划，感觉生活充满了希望。'
        },
        {
          id: '6',
          date: new Date(today.getFullYear(), today.getMonth(), 22).toISOString().split('T')[0],
          content: '今天坚持完成了健身计划，虽然很累但感觉很棒。流汗的感觉真的很舒服，身体也变得更有活力了。'
        },
        {
          id: '7',
          date: new Date(today.getFullYear(), today.getMonth(), 25).toISOString().split('T')[0],
          content: '周末和家人一起聚餐，妈妈做了很多好吃的菜。大家围坐在一起聊天，感觉特别温馨。这种简单的幸福最珍贵。'
        }
      ]
      
      // 检查是否已有日记数据，如果没有则使用示例数据
      const existingDiaries = JSON.parse(localStorage.getItem('diaries') || '[]')
      if (existingDiaries.length === 0) {
        localStorage.setItem('diaries', JSON.stringify(sampleDiaries))
        diaries.value = sampleDiaries
      } else {
        diaries.value = existingDiaries
      }
    }
    
    const currentMonthYear = computed(() => {
      const year = currentDate.value.getFullYear()
      const month = currentDate.value.getMonth()
      return `${year}年${month + 1}月`
    })
    
    const calendarDays = computed(() => {
      const year = currentDate.value.getFullYear()
      const month = currentDate.value.getMonth()
      
      // 获取当月第一天和最后一天
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      
      // 获取当月第一天是星期几
      const firstDayOfWeek = firstDay.getDay()
      
      // 获取上个月的最后几天
      const prevMonthLastDay = new Date(year, month, 0).getDate()
      const prevMonthDays = []
      for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        prevMonthDays.push({
          date: new Date(year, month - 1, prevMonthLastDay - i).toISOString().split('T')[0],
          dayOfMonth: prevMonthLastDay - i,
          isCurrentMonth: false
        })
      }
      
      // 获取当月所有天数
      const currentMonthDays = []
      for (let i = 1; i <= lastDay.getDate(); i++) {
        currentMonthDays.push({
          date: new Date(year, month, i).toISOString().split('T')[0],
          dayOfMonth: i,
          isCurrentMonth: true
        })
      }
      
      // 获取下个月的前几天，填满日历
      const totalCells = prevMonthDays.length + currentMonthDays.length
      const nextMonthDays = []
      const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
      
      for (let i = 1; i <= remainingCells; i++) {
        nextMonthDays.push({
          date: new Date(year, month + 1, i).toISOString().split('T')[0],
          dayOfMonth: i,
          isCurrentMonth: false
        })
      }
      
      return [...prevMonthDays, ...currentMonthDays, ...nextMonthDays]
    })
    
    const isToday = (date) => {
      const today = new Date()
      return date === today.toISOString().split('T')[0]
    }
    
    const hasDiary = (date) => {
      return diaries.value.some(diary => diary.date === date)
    }
    
    const getDiaryByDate = (date) => {
      return diaries.value.find(diary => diary.date === date)
    }
    
    const getDiarySnippet = (date) => {
      const diary = getDiaryByDate(date)
      if (!diary) return ''
      
      // 获取前两行作为预览
      const lines = diary.content.split('\n').filter(line => line.trim())
      let snippet = lines.slice(0, 2).join('\n') // 使用换行符而不是空格连接
      
      // 如果内容太长，截断并添加省略号
      if (snippet.length > 40) {
        snippet = snippet.substring(0, 40) + '...'
      }
      
      return snippet
    }
    
    const formatDate = (dateString) => {
      const options = { year: 'numeric', month: 'long', day: 'numeric' }
      return new Date(dateString).toLocaleDateString('zh-CN', options)
    }
    
    const previousMonth = () => {
      currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1)
    }
    
    const nextMonth = () => {
      currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1)
    }
    
    const handleDayClick = (day) => {
      selectedDate.value = day.date
      const diary = getDiaryByDate(day.date)
      
      if (diary) {
        // 如果有日记，显示日记内容
        selectedDayDiary.value = diary
        isEditMode.value = false
      } else {
        // 如果没有日记，直接进入写日记模式
        selectedDayDiary.value = null
        isEditMode.value = true
        diaryForm.value = {
          content: ''
        }
      }
    }
    
    const enterEditMode = () => {
      if (selectedDayDiary.value) {
        diaryForm.value = {
          content: selectedDayDiary.value.content
        }
      }
      isEditMode.value = true
    }
    
    const saveDiary = () => {
      // 获取当前存储的日记数据
      const storedDiaries = JSON.parse(localStorage.getItem('diaries') || '[]')
      
      if (selectedDayDiary.value) {
        // 编辑现有日记
        const diaryIndex = storedDiaries.findIndex(d => d.id === selectedDayDiary.value.id)
        if (diaryIndex !== -1) {
          storedDiaries[diaryIndex] = {
            ...storedDiaries[diaryIndex],
            content: diaryForm.value.content
          }
          selectedDayDiary.value = storedDiaries[diaryIndex]
        }
      } else {
        // 创建新日记
        const newDiary = {
          id: Date.now().toString(),
          date: selectedDate.value,
          content: diaryForm.value.content
        }
        storedDiaries.push(newDiary)
        selectedDayDiary.value = newDiary
      }
      
      // 保存到localStorage
      localStorage.setItem('diaries', JSON.stringify(storedDiaries))
      
      // 更新响应式数据
      diaries.value = [...storedDiaries]
      
      // 关闭弹窗
      closeDiaryModal()
    }
    
    const deleteDiary = () => {
      if (confirm('确定要删除这篇日记吗？')) {
        // 获取当前存储的日记数据
        const storedDiaries = JSON.parse(localStorage.getItem('diaries') || '[]')
        const updatedDiaries = storedDiaries.filter(d => d.id !== selectedDayDiary.value.id)
        
        // 保存到localStorage
        localStorage.setItem('diaries', JSON.stringify(updatedDiaries))
        
        // 更新响应式数据
        diaries.value = [...updatedDiaries]
        
        closeDiaryModal()
      }
    }
    
    const closeDiaryModal = () => {
      selectedDayDiary.value = null
      selectedDate.value = null
      isEditMode.value = false
      diaryForm.value = {
        content: ''
      }
    }
    
    onMounted(() => {
      initSampleDiaries()
    })
    
    return {
      currentDate,
      currentMonthYear,
      calendarDays,
      weekdays,
      diaries,
      selectedDayDiary,
      selectedDate,
      isEditMode,
      diaryForm,
      isToday,
      hasDiary,
      getDiarySnippet,
      formatDate,
      previousMonth,
      nextMonth,
      handleDayClick,
      enterEditMode,
      saveDiary,
      deleteDiary,
      closeDiaryModal
    }
  }
}
</script>

<style scoped>
.calendar-view {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.calendar-header h1 {
  color: #42b983;
  margin: 0;
}

.month-navigation {
  display: flex;
  align-items: center;
  gap: 15px;
}

.month-navigation h2 {
  color: #2c3e50;
  margin: 0;
  min-width: 120px;
  text-align: center;
}

.nav-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #42b983;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.3s;
}

.nav-btn:hover {
  background-color: rgba(66, 185, 131, 0.1);
}

.calendar {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background-color: #f8f9fa;
}

.weekday {
  padding: 15px 0;
  text-align: center;
  font-weight: bold;
  color: #2c3e50;
  border-right: 1px solid #eee;
}

.weekday:last-child {
  border-right: none;
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.day {
  min-height: 100px;
  padding: 8px;
  border-right: 1px solid #eee;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  transition: background-color 0.3s;
  position: relative;
}

.day:nth-child(7n) {
  border-right: none;
}

.other-month {
  background-color: #f8f9fa;
  color: #bbb;
}

.today {
  background-color: rgba(66, 185, 131, 0.1);
}

.has-diary {
  background-color: rgba(66, 185, 131, 0.05);
}

.day:hover {
  background-color: rgba(66, 185, 131, 0.2);
}

.day-number {
  font-weight: bold;
  margin-bottom: 5px;
  color: #2c3e50;
}

.other-month .day-number {
  color: #bbb;
}

.today .day-number {
  color: #42b983;
}

.diary-preview {
  font-size: 12px;
  color: #666;
  line-height: 1.4;
}

.diary-snippet {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  white-space: pre-wrap; /* 保留换行符和空格 */
  word-wrap: break-word; /* 允许长单词换行 */
}

/* 模态框样式 */
.diary-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.diary-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
  padding: 20px;
  border-bottom: 1px solid #eee;
  position: relative;
}

.modal-header h3 {
  margin: 0 0 5px 0;
  color: #2c3e50;
}

.diary-date {
  color: #888;
  font-size: 14px;
}

.close-btn {
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
}

.close-btn:hover {
  color: #666;
}

.modal-body {
  padding: 20px;
  line-height: 1.6;
  color: #333;
}

.diary-content-text {
  white-space: pre-wrap; /* 保留换行符和空格 */
  word-wrap: break-word; /* 允许长单词换行 */
  font-family: inherit;
}

.modal-actions {
  padding: 15px 20px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.view-btn, .edit-btn {
  display: inline-block;
  padding: 8px 16px;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.3s;
}

.view-btn {
  background-color: #42b983;
  color: white;
}

.view-btn:hover {
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
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.delete-btn:hover {
  background: #c0392b;
}

/* 表单样式 */
.diary-form-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.diary-form {
  padding: 0 20px 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
  color: #2c3e50;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
  font-family: inherit;
  box-sizing: border-box;
}

.form-group textarea {
  resize: vertical;
  min-height: 200px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 15px;
  margin-top: 20px;
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
  background-color: #f0f0f0;
  color: #333;
  border: none;
  border-radius: 4px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.cancel-btn:hover {
  background-color: #e0e0e0;
}

@media (max-width: 768px) {
  .calendar-header {
    flex-direction: column;
    gap: 15px;
  }
  
  .day {
    min-height: 80px;
    padding: 5px;
  }
  
  .diary-preview {
    font-size: 11px;
  }
}
</style>
