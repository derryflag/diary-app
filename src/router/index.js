import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Album from '../views/Album.vue'
import Course from '../views/Course.vue'
import Login from '../views/Login.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { requiresAuth: true }
  },
  {
    path: '/chart',
    name: 'Chart3D',
    component: () => import('../views/Chart3D.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/pie',
    name: 'Pie3D',
    component: () => import('../views/Pie3D.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/album',
    name: 'Album',
    component: Album,
    meta: { requiresAuth: true }
  },
  {
    path: '/course',
    name: 'Course',
    component: Course,
    meta: { requiresAuth: true }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

const checkAuth = () => {
  const token = localStorage.getItem('auth_token')
  const expires = localStorage.getItem('auth_expires')
  if (!token || !expires) return false
  if (Date.now() > parseInt(expires)) {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_expires')
    return false
  }
  return true
}

router.beforeEach((to) => {
  if (to.meta.requiresAuth !== false) {
    if (!checkAuth()) {
      return { name: 'Login' }
    }
  }
})

export default router
