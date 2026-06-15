<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo">🐰</div>
      <h1>灰兔科技</h1>
      <p class="subtitle">请输入六位访问密码，成功后90天内无需重复输入</p>
      <form @submit.prevent="handleLogin" class="login-form">
        <input
          ref="passwordInput"
          v-model="password"
          type="text"
          placeholder="六位数团团出生日期"
          autocomplete="off"
          class="password-input"
        />
        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? '验证中...' : '进入' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

export default {
  name: 'Login',
  setup() {
    const router = useRouter()
    const passwordInput = ref(null)
    const password = ref('')
    const errorMsg = ref('')
    const loading = ref(false)

    const handleLogin = async () => {
      if (!password.value) {
        errorMsg.value = '请输入密码'
        return
      }

      loading.value = true
      errorMsg.value = ''

      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: password.value })
        })
        const result = await res.json()

        if (result.success) {
          const expiresDays = 90
          const expires = Date.now() + expiresDays * 24 * 60 * 60 * 1000
          // 同时存 localStorage 和 cookie，确保 PWA 模式下持久化
          localStorage.setItem('auth_token', result.token)
          localStorage.setItem('auth_expires', String(expires))
          document.cookie = `auth_token=${result.token}; max-age=${expiresDays * 24 * 60 * 60}; path=/; SameSite=Lax`
          document.cookie = `auth_expires=${expires}; max-age=${expiresDays * 24 * 60 * 60}; path=/; SameSite=Lax`
          router.push('/')
        } else {
          errorMsg.value = result.error || '密码错误'
          password.value = ''
          passwordInput.value?.focus()
        }
      } catch (err) {
        errorMsg.value = '验证失败，请重试'
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      passwordInput.value?.focus()
    })

    return {
      passwordInput,
      password,
      errorMsg,
      loading,
      handleLogin
    }
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fef9f3 0%, #f5f0ff 50%, #f0f7ff 100%);
}

.login-card {
  background: white;
  padding: 40px;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  text-align: center;
  width: 320px;
}

.logo {
  font-size: 48px;
  margin-bottom: 12px;
}

h1 {
  margin: 0 0 8px;
  background: linear-gradient(135deg, #85c285, #5b9bd5);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-size: 24px;
  font-weight: 600;
}

.subtitle {
  margin: 0 0 24px;
  color: #6b7280;
  font-size: 14px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.password-input {
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s;
  text-align: center;
}

.password-input:focus {
  border-color: #85c285;
}

.error-msg {
  margin: 0;
  color: #ef4444;
  font-size: 13px;
}

.login-btn {
  padding: 12px;
  background: linear-gradient(135deg, #85c285, #6bb36b);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(133, 194, 133, 0.4);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
