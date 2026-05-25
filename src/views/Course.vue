<template>
  <div class="course-view">
    <div class="course-content">
      <h1>课程</h1>
      <p class="course-desc">即将上线，敬请期待！</p>
      <div class="course-placeholder">
        <div class="placeholder-icon">📚</div>
        <p>课程内容正在准备中...</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Course'
}
</script>

<style scoped>
.course-view {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}

.course-content {
  text-align: center;
  padding: 60px 20px;
}

.course-content h1 {
  background: linear-gradient(135deg, #85c285, #5b9bd5);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0 0 10px;
  font-size: 28px;
  font-weight: 600;
}

.course-desc {
  color: #666;
  font-size: 16px;
  margin: 0 0 40px;
}

.course-placeholder {
  background: linear-gradient(90deg, #ffffff 0%, #f0f8ff 50%, #e6f2ff 100%);
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(91, 155, 213, 0.15);
  padding: 60px 20px;
  border: 1px solid rgba(91, 155, 213, 0.15);
}

.placeholder-icon {
  font-size: 80px;
  margin-bottom: 20px;
}

.course-placeholder p {
  color: #999;
  font-size: 18px;
  margin: 0;
}

@media (max-width: 768px) {
  .course-view {
    max-width: none;
    margin: 0;
    padding: 0;
  }
  
  .course-content {
    padding: 40px 15px;
  }
  
  .course-content h1 {
    font-size: 24px;
  }
  
  .course-desc {
    font-size: 14px;
  }
  
  .placeholder-icon {
    font-size: 60px;
  }
  
  .course-placeholder p {
    font-size: 16px;
  }
}
</style>
