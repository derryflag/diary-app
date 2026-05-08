import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Album from '../views/Album.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/chart',
    name: 'Chart3D',
    component: () => import('../views/Chart3D.vue')
  },
  {
    path: '/pie',
    name: 'Pie3D',
    component: () => import('../views/Pie3D.vue')
  },
  {
    path: '/album',
    name: 'Album',
    component: Album
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

export default router
