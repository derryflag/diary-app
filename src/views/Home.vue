<template>
  <div class="calendar-view">
    <div class="calendar-header">
      <h1>日记本</h1>
      <h2 class="center-title">团团的幸福生活</h2>
      <div class="view-toggle">
        <button @click="viewMode = 'week'" :class="{ active: viewMode === 'week' }">周视图</button>
        <button @click="viewMode = 'month'" :class="{ active: viewMode === 'month' }">月视图</button>
      </div>
      <div class="month-navigation">
        <button @click="viewMode === 'month' ? previousMonth() : previousWeek()" class="nav-btn">&lt;</button>
        <h2>{{ viewMode === 'month' ? currentMonthYear : currentWeekRange }}</h2>
        <button @click="viewMode === 'month' ? nextMonth() : nextWeek()" class="nav-btn">&gt;</button>
      </div>
    </div>
    
    <!-- 月视图 -->
    <div v-if="viewMode === 'month'" class="calendar">
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
    
    <!-- 周视图 -->
    <div v-else class="week-view">
      <div class="week-grid">
        <div 
          v-for="day in weekDays" 
          :key="day.date"
          :class="{
            'week-day': true,
            'today': isToday(day.date),
            'has-diary': hasDiary(day.date),
            'weekend': day.dayOfWeek === 0 || day.dayOfWeek === 6
          }"
          @click="handleDayClick(day)"
        >
          <div class="week-day-header">
            <span class="week-day-name">{{ weekdaysFull[day.dayOfWeek] }}</span>
            <span class="week-day-number">{{ day.dayOfMonth }}</span>
            <span class="lunar-day" v-if="day.lunarInfo && day.lunarInfo.day">{{ day.lunarInfo.day }}</span>
          </div>
          <div v-if="hasDiary(day.date)" class="week-diary-content">
            {{ getDiaryContent(day.date) }}
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
    
    <div class="footer-actions">
      <button @click="handleExport" class="action-btn">导出备份</button>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getDiaryByDate } from '../utils/diaryUtils'
import { getLunarInfo } from '../utils/lunar'
import { dbAPI, exportToJSON } from '../utils/db'

export default {
  name: 'Home',
  setup() {
    const currentDate = ref(new Date())
    const viewMode = ref('week')
    const diaries = ref([])
    const selectedDayDiary = ref(null)
    const selectedDate = ref(null)
    const isEditMode = ref(false)
    const diaryForm = ref({
      content: ''
    })
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const weekdaysFull = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    
    const loadDiaries = async () => {
      diaries.value = await dbAPI.getAll()
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
    
    const currentWeekRange = computed(() => {
      const year = currentDate.value.getFullYear()
      const month = currentDate.value.getMonth()
      const date = currentDate.value.getDate()
      const dayOfWeek = new Date(year, month, date).getDay()
      
      const startDate = new Date(year, month, date - dayOfWeek)
      const endDate = new Date(year, month, date + (6 - dayOfWeek))
      
      const startMonth = startDate.getMonth() + 1
      const endMonth = endDate.getMonth() + 1
      
      if (startMonth === endMonth) {
        return `${startDate.getMonth() + 1}月${startDate.getDate()}日 - ${endDate.getDate()}日`
      } else {
        return `${startDate.getMonth() + 1}月${startDate.getDate()}日 - ${endDate.getMonth() + 1}月${endDate.getDate()}日`
      }
    })
    
    const weekDays = computed(() => {
      const year = currentDate.value.getFullYear()
      const month = currentDate.value.getMonth()
      const date = currentDate.value.getDate()
      const dayOfWeek = new Date(year, month, date).getDay()
      
      const days = []
      for (let i = -dayOfWeek; i < 7 - dayOfWeek; i++) {
        const d = new Date(year, month, date + i)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        days.push({
          date: dateStr,
          dayOfMonth: d.getDate(),
          dayOfWeek: d.getDay(),
          lunarInfo: getLunarInfo(dateStr)
        })
      }
      return days
    })
    
    const previousWeek = () => {
      currentDate.value = new Date(currentDate.value.getTime() - 7 * 24 * 60 * 60 * 1000)
    }
    
    const nextWeek = () => {
      currentDate.value = new Date(currentDate.value.getTime() + 7 * 24 * 60 * 60 * 1000)
    }
    
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
      
      const lines = diary.content.split('\n').filter(line => line.trim())
      let snippet = lines.slice(0, 2).join(' ')
      
      if (snippet.length > 40) {
        snippet = snippet.substring(0, 40) + '...'
      }
      
      return snippet
    }
    
    const getDiaryContent = (date) => {
      const diary = getDiaryByDate(date, diaries.value)
      if (!diary) return ''
      return diary.content
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
          date: selectedDate.value,
          content: diaryForm.value.content
        }
        await dbAPI.add(newDiary)
        selectedDayDiary.value = newDiary
      }

      closeDiaryModal()
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
    
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        closeDiaryModal()
      }
    }
    
    onMounted(() => {
      loadDiaries()
      window.addEventListener('keydown', handleKeydown)
    })
    
    onUnmounted(() => {
      window.removeEventListener('keydown', handleKeydown)
    })
    
    return {
      currentDate,
      viewMode,
      currentMonthYear,
      currentWeekRange,
      calendarDays,
      weekDays,
      weekdays,
      weekdaysFull,
      diaries,
      selectedDayDiary,
      selectedDate,
      isEditMode,
      diaryForm,
      isToday,
      hasDiary,
      getDiarySnippet,
      getDiaryContent,
      getLunarInfo,
      formatDate,
      previousMonth,
      nextMonth,
      previousWeek,
      nextWeek,
      handleDayClick,
      enterEditMode,
      saveDiary,
      deleteDiary,
      closeDiaryModal,
      handleExport
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

.footer-actions {
  margin-top: 30px;
  text-align: center;
  padding-top: 20px;
  border-top: 1px solid #eee;
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

.view-toggle {
  display: flex;
  gap: 5px;
}

.view-toggle button {
  background: #f0f0f0;
  border: none;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 14px;
  border-radius: 4px;
}

.view-toggle button.active {
  background: #42b983;
  color: white;
}

.view-toggle button:first-child {
  border-radius: 4px 0 0 4px;
}

.view-toggle button:last-child {
  border-radius: 0 4px 4px 0;
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
  display: flex;
  flex-direction: column;
}

.day:hover {
  background-color: #f9f9f9;
}

.day .diary-empty {
  margin-top: auto;
  padding-top: 10px;
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
  padding-right: 40px;
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
  .calendar-view {
    max-width: none;
    margin: 0;
    padding: 0;
  }
  
  .calendar-header {
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    margin-bottom: 10px;
  }
  
  .action-btn {
    padding: 8px 16px;
    font-size: 14px;
    flex: 1;
  }
  
  .month-navigation {
    margin-bottom: 10px;
    width: 100%;
    justify-content: space-between;
  }
  
  .calendar {
    border-radius: 0;
  }
  
  .footer-actions {
    padding: 15px;
    text-align: center;
  }
  
  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
  }
  
  .weekday {
    padding: 8px 0;
    font-size: 12px;
  }
  
  .day {
    min-height: 80px;
    padding: 4px;
  }
  
  .day-number {
    font-size: 14px;
  }
  
  .lunar-day {
    font-size: 9px;
  }
  
  .diary-preview {
    display: none;
  }
  
  .has-diary .diary-preview {
    display: block;
    font-size: 10px;
  }
  
  .diary-snippet {
    -webkit-line-clamp: 2;
  }
  
  .diary-modal {
    padding: 0;
  }
  
  .diary-form-content {
    width: 100% !important;
    max-width: 100% !important;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }
  
  .form-group textarea {
    min-height: 150px;
    font-size: 14px;
  }
}

.week-view {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.week-day {
  min-height: 200px;
  padding: 10px;
  border-right: 1px solid #eee;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  transition: background-color 0.3s;
  background: white;
}

.week-day:last-child {
  border-right: none;
}

.week-day:hover {
  background-color: #f9f9f9;
}

.week-day.today .week-day-number {
  color: #42b983;
}

.week-day.weekend .week-day-number {
  color: #e74c3c;
}

.week-day-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 10px;
}

.week-day-name {
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
}

.week-day-number {
  font-size: 24px;
  font-weight: bold;
  color: #2c3e50;
}

.week-day .lunar-day {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.week-diary-content {
  font-size: 13px;
  line-height: 1.5;
  color: #333;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-y: auto;
  max-height: 140px;
}

.diary-empty {
  font-size: 12px;
  color: #ccc;
  text-align: center;
  padding-top: 20px;
}

@media (max-width: 768px) {
  .week-view {
    border-radius: 0;
  }
  
  .week-grid {
    grid-template-columns: 1fr;
  }
  
  .week-day {
    min-height: auto;
    padding: 8px 10px;
    border-right: none;
    border-bottom: 1px solid #eee;
    display: flex;
    gap: 10px;
  }
  
  .week-day:last-child {
    border-bottom: none;
  }
  
  .week-day-header {
    flex-direction: column;
    align-items: center;
    margin-bottom: 0;
    min-width: 40px;
  }
  
  .week-day-name {
    font-size: 10px;
  }
  
  .week-day-number {
    font-size: 18px;
  }
  
  .week-day .lunar-day {
    margin-top: 0;
    font-size: 9px;
  }
  
  .week-diary-content {
    flex: 1 !important;
    font-size: 12px !important;
    max-height: 3.5em !important;
    overflow: hidden !important;
  }
  
  .diary-empty {
    flex: 1;
    font-size: 11px;
    padding-top: 0;
    text-align: left;
    align-self: center;
  }
}
</style>