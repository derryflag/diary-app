<template>
  <div class="calendar-view">
    <div class="calendar-header">
      <h1>日记本</h1>
      <h2 class="center-title">团团的幸福生活</h2>
      <div class="header-actions">
        <button @click="handleExport" class="action-btn">导出备份</button>
        <button @click="handleImport" class="action-btn">导入恢复</button>
        <input
          type="file"
          ref="fileInput"
          accept=".json"
          style="display: none"
          @change="handleFileSelect"
        >
      </div>
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
          :class="{
            'day': true,
            'other-month': !day.isCurrentMonth,
            'today': isToday(day.date),
            'has-diary': hasDiary(day.date),
            'weekend': day.dayOfWeek === 0 || day.dayOfWeek === 6,
            'saturday': day.dayOfWeek === 6,
            'sunday': day.dayOfWeek === 0
          }"
          @click="handleDayClick(day)"
        >
          <div class="day-header">
            <span class="day-number">{{ day.dayOfMonth }}</span>
            <span class="lunar-day" v-if="day.isCurrentMonth && day.lunarInfo && day.lunarInfo.day">{{ day.lunarInfo.day }}</span>
          </div>
          <div v-if="hasDiary(day.date)" class="diary-preview">
            <div class="diary-snippet">{{ getDiarySnippet(day.date) }}</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 查看日记模态框 -->
    <div v-if="selectedDayDiary && !isEditMode" class="diary-modal" @click.self="closeDiaryModal">
      <div class="diary-form-content">
        <div class="modal-header">
          <h3>查看日记</h3>
          <span class="diary-date">{{ formatDate(selectedDayDiary.date) }}</span>
          <button @click="closeDiaryModal" class="close-btn">&times;</button>
        </div>
        <form @submit.prevent="saveDiary">
          <div class="form-group">
            <textarea 
              id="viewContent" 
              v-model="diaryForm.content" 
              rows="10"
            ></textarea>
          </div>
          
          <div class="form-actions">
            <button type="submit" class="save-btn">保存</button>
            <button type="button" @click="closeDiaryModal" class="cancel-btn">取消</button>
          </div>
        </form>
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getDiaryByDate } from '../utils/diaryUtils'
import { getLunarInfo } from '../utils/lunar'
import { dbAPI, exportToJSON, importFromJSON } from '../utils/db'

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
    const fileInput = ref(null)
    
    const loadDiaries = async () => {
      diaries.value = await dbAPI.getAll()
    }
    
    const loadSampleDiaries = async () => {
      const today = new Date()
      const year = today.getFullYear()
      const month = today.getMonth() + 1
      
      const sampleDiaries = [
        {
          date: `${year}-${String(month).padStart(2, '0')}-17`,
          content: '年初一，下午去了同庆街看灯会，在大马旁边拍了很多照片，团团半途喝酸奶不喝配方奶了；今天还巧遇了李广。'
        },
        {
          date: `${year}-${String(month).padStart(2, '0')}-18`,
          content: '去了圆明园，人太多了，团团喝了酸奶也喝了配方奶；鞋子总掉。'
        },
        {
          date: `${year}-${String(month).padStart(2, '0')}-19`,
          content: '下午去了生命科学园的合生汇，建筑布局太乱了，没找到捞鱼的地方，差评'
        },
        {
          date: `${year}-${String(month).padStart(2, '0')}-20`,
          content: '小叔一家4口来玩，团团2点多起来了不认生，不哭，只是观察。'
        },
        {
          date: `${year}-${String(month).padStart(2, '0')}-21`,
          content: '到清河万象汇买鞋，还是江博士的鞋好一些，方便近期学步，顺便吃了炒冰激凌。'
        },
        {
          date: `${year}-${String(month).padStart(2, '0')}-22`,
          content: '下午来了昌发展，爸妈看了《惊蛰无声》，团团看了鹦鹉兔子仓鼠，还玩了游乐场，可开心了。'
        },
        {
          date: `${year}-${String(month).padStart(2, '0')}-23`,
          content: '到爸爸糖动物农场来看小动物，看到了兔子、绵羊、小马、鸡鸭鹅等，团团很爱玩沙子，人挺少，停车地方有的是。但是回去之后不好好吃饭6点直接睡了'
        }
      ]
      
      const existingDiaries = await dbAPI.getAll()
      if (existingDiaries.length === 0) {
        await dbAPI.bulkPut(sampleDiaries)
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
        const prevMonth = month === 0 ? 12 : month
        const prevYear = month === 0 ? year - 1 : year
        const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevMonthLastDay - i).padStart(2, '0')}`
        const dateObj = new Date(prevYear, prevMonth - 1, prevMonthLastDay - i)
        prevMonthDays.push({
          date: dateStr,
          dayOfMonth: prevMonthLastDay - i,
          dayOfWeek: dateObj.getDay(),
          isCurrentMonth: false
        })
      }
      
      // 获取当月所有天数
      const currentMonthDays = []
      for (let i = 1; i <= lastDay.getDate(); i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
        const dateObj = new Date(year, month, i)
        currentMonthDays.push({
          date: dateStr,
          dayOfMonth: i,
          dayOfWeek: dateObj.getDay(),
          isCurrentMonth: true,
          lunarInfo: getLunarInfo(dateStr)
        })
      }
      
      // 获取下个月的前几天，填满日历
      const totalCells = prevMonthDays.length + currentMonthDays.length
      const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
      
      const nextMonthDays = []
      for (let i = 1; i <= remainingCells; i++) {
        const nextMonth = month === 11 ? 1 : month + 2
        const nextYear = month === 11 ? year + 1 : year
        const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`
        const dateObj = new Date(nextYear, nextMonth - 1, i)
        nextMonthDays.push({
          date: dateStr,
          dayOfMonth: i,
          dayOfWeek: dateObj.getDay(),
          isCurrentMonth: false
        })
      }
      
      return [...prevMonthDays, ...currentMonthDays, ...nextMonthDays]
    })
    
    const isToday = (date) => {
      const today = new Date()
      const year = today.getFullYear()
      const month = today.getMonth() + 1
      const day = today.getDate()
      const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return date === todayStr
    }
    
    const hasDiary = (date) => {
      return diaries.value.some(diary => diary.date === date)
    }
    
    const getDiarySnippet = (date) => {
      const diary = getDiaryByDate(date, diaries.value)
      if (!diary) return ''
      
      // 获取前两行作为预览
      const lines = diary.content.split('\n').filter(line => line.trim())
      let snippet = lines.slice(0, 2).join(' ')
      
      // 如果内容太长，截断并添加省略号
      if (snippet.length > 40) {
        snippet = snippet.substring(0, 40) + '...'
      }
      
      return snippet
    }
    
    const formatDate = (date) => {
      const options = { year: 'numeric', month: 'long', day: 'numeric' }
      return new Date(date).toLocaleDateString('zh-CN', options)
    }
    
    const previousMonth = () => {
      currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1)
    }
    
    const nextMonth = () => {
      currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1)
    }
    
    const handleDayClick = (day) => {
      selectedDate.value = day.date
      const diary = getDiaryByDate(day.date, diaries.value)
      
      if (diary) {
        selectedDayDiary.value = diary
        isEditMode.value = false
        diaryForm.value = {
          content: diary.content
        }
      } else {
        selectedDayDiary.value = null
        isEditMode.value = true
        diaryForm.value = {
          content: '\n\n\n\n\n'
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
    
    const saveDiary = async () => {
      if (selectedDayDiary.value) {
        const updatedDiary = {
          ...selectedDayDiary.value,
          content: diaryForm.value.content
        }
        await dbAPI.add(updatedDiary)
        selectedDayDiary.value = updatedDiary
      } else {
        const newDiary = {
          id: Date.now().toString(),
          date: selectedDate.value,
          content: diaryForm.value.content
        }
        await dbAPI.add(newDiary)
        selectedDayDiary.value = newDiary
      }

      isEditMode.value = false
      await loadDiaries()
    }
    
    const deleteDiary = () => {
      if (confirm('确定要删除这篇日记吗？')) {
        dbAPI.delete(selectedDayDiary.value.date).then(() => {
          closeDiaryModal()
          loadDiaries()
        })
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
    
    const handleExport = () => {
      exportToJSON(diaries.value)
    }
    
    const handleImport = () => {
      fileInput.value.click()
    }
    
    const handleFileSelect = async (event) => {
      const file = event.target.files[0]
      if (!file) return
      
      try {
        const importedDiaries = await importFromJSON(file)
        await dbAPI.clear()
        await dbAPI.bulkPut(importedDiaries)
        await loadDiaries()
        alert('导入成功！')
      } catch (error) {
        alert('导入失败：' + error.message)
      }
      
      event.target.value = ''
    }
    
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        closeDiaryModal()
      }
    }
    
    onMounted(() => {
      loadSampleDiaries()
      window.addEventListener('keydown', handleKeydown)
    })
    
    onUnmounted(() => {
      window.removeEventListener('keydown', handleKeydown)
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
      fileInput,
      isToday,
      hasDiary,
      getDiarySnippet,
      getLunarInfo,
      formatDate,
      previousMonth,
      nextMonth,
      handleDayClick,
      enterEditMode,
      saveDiary,
      deleteDiary,
      closeDiaryModal,
      handleExport,
      handleImport,
      handleFileSelect
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
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.action-btn {
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.3s;
}

.action-btn:hover {
  background-color: #2980b9;
}

.calendar-header h1 {
  color: #42b983;
  margin: 0;
  font-size: 20px;
}

.center-title {
  color: #2c3e50;
  margin: 0;
  font-size: 16px;
  font-weight: normal;
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
  background: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.3s;
}

.nav-btn:hover {
  background-color: #369870;
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
  min-height: 120px;
  padding: 8px;
  border-right: 1px solid #eee;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  transition: all 0.3s ease;
}

.day:hover {
  background-color: #f9f9f9;
}

.day.other-month {
  background-color: #f9f9f9;
}

.day.other-month:hover {
  background-color: #f0f0f0;
}

.day-header {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 2px;
}

.day-number {
  font-size: 18px;
  font-weight: bold;
  color: #2c3e50;
}

.lunar-day {
  font-size: 11px;
  color: #999;
  font-weight: normal;
}

.other-month .day-number {
  color: #bbb;
}

.other-month .lunar-day {
  color: #bbb;
}

.today .day-number {
  color: #42b983;
}

.today.has-diary::after {
  display: none;
}

.saturday .day-number {
  color: #e74c3c;
}

.sunday .day-number {
  color: #e74c3c;
  font-weight: bold;
}

.has-diary {
  border-radius: 4px;
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
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.lunar-day {
  font-weight: bold;
}

.lunar-festival {
  color: #e74c3c;
  font-weight: bold;
  margin-top: 2px;
}

.diary-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.diary-content {
  background: white !important;
  border-radius: 8px;
  width: 90% !important;
  max-width: 600px !important;
  min-height: 400px;
  max-height: 80vh;
  overflow: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
}

.diary-form-content {
  background: white !important;
  border-radius: 8px;
  width: 90% !important;
  max-width: 600px !important;
  min-height: 400px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
}

.diary-form {
  padding: 0 20px 20px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  color: #2c3e50;
  margin: 0;
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
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: inherit;
}

.modal-actions {
  padding: 15px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 15px;
  margin-top: 20px;
}

.edit-btn {
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.edit-btn:hover {
  background-color: #369870;
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

.form-group {
  margin-bottom: 10px;
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
  margin-top: auto;
  padding-top: 5px;
  padding-bottom: 5px;
}

.save-btn {
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-size: 14px;
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
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.cancel-btn:hover {
  background-color: #e0e0e0;
}

@media (max-width: 768px) {
  .calendar-header {
    flex-direction: column;
    }
    
  .month-navigation {
    margin-bottom: 15px;
  }
    
  .day {
    min-height: 100px;
    padding: 5px;
  }
}
</style>