<template>
  <div id="app">
    <nav class="top-nav">
      <div class="nav-container">
        <router-link to="/" class="nav-item" :class="{ active: isRouteActive('/') }">
          <span class="nav-icon">📖</span>
          <span class="nav-text">日记</span>
        </router-link>
        <router-link to="/album" class="nav-item" :class="{ active: isRouteActive('/album') }">
          <span class="nav-icon">📷</span>
          <span class="nav-text">相册</span>
        </router-link>
        <router-link to="/course" class="nav-item" :class="{ active: isRouteActive('/course') }">
          <span class="nav-icon">📚</span>
          <span class="nav-text">课程</span>
        </router-link>
      </div>
    </nav>
    <main>
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
  </div>
</template>

<script>
export default {
  name: 'App',
  methods: {
    isRouteActive(path) {
      if (path === '/' && this.$route.path === '/') return true
      if (path !== '/' && this.$route.path.startsWith(path)) return true
      return false
    }
  }
}
</script>

<style>
:root {
  --primary-color: #5b9bd5;
  --secondary-color: #85c285;
  --accent-color: #ffb347;
  --bg-gradient-start: #fef9f3;
  --bg-gradient-end: #f0f7ff;
  --bg-card: #ffffff;
  --text-primary: #3d3d3d;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  background: linear-gradient(135deg, #fef9f3 0%, #f5f0ff 50%, #f0f7ff 100%);
  min-height: 100vh;
}

#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: var(--text-primary);
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}

.top-nav {
  background: linear-gradient(135deg, #ffffff 0%, #f8faff 100%);
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(91, 155, 213, 0.1);
  margin-bottom: 20px;
  padding: 8px;
  position: sticky;
  top: 10px;
  z-index: 100;
  backdrop-filter: blur(10px);
}

.nav-container {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.nav-item {
  flex: 1;
  max-width: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 12px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 500;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.nav-item::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 3px;
  background: linear-gradient(90deg, #85c285, #5b9bd5);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.nav-item:hover {
  background: rgba(91, 155, 213, 0.05);
  color: var(--primary-color);
}

.nav-item:hover::before {
  width: 60%;
}

.nav-item.active {
  background: linear-gradient(135deg, rgba(133, 194, 133, 0.15), rgba(91, 155, 213, 0.15));
  color: var(--primary-color);
  font-weight: 600;
}

.nav-item.active::before {
  width: 80%;
}

.nav-icon {
  font-size: 18px;
  transition: transform 0.3s ease;
}

.nav-item:hover .nav-icon {
  transform: scale(1.1);
}

.nav-item.active .nav-icon {
  transform: scale(1.15);
}

.nav-text {
  white-space: nowrap;
}

main {
  min-height: calc(100vh - 100px);
}

@media (max-width: 768px) {
  #app {
    max-width: none;
    margin: 0;
    padding: 0;
  }

  .top-nav {
    margin: 0 10px 15px;
    border-radius: 12px;
    top: 5px;
  }

  .nav-container {
    gap: 4px;
  }

  .nav-item {
    padding: 10px 12px;
    font-size: 14px;
    gap: 6px;
  }

  .nav-icon {
    font-size: 16px;
  }
}
</style>
