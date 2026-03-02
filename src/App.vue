<template>
  <div id="app">
    <main>
      <router-view />
    </main>
  </div>
</template>

<script>
export default {
  name: 'App'
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

main {
  min-height: 100vh;
}

@media (max-width: 768px) {
  #app {
    max-width: none;
    margin: 0;
    padding: 0;
  }
}
</style>
