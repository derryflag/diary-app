import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Chart3D from '../views/Chart3D.vue'
import Pie3D from '../views/Pie3D.vue'
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
    component: Chart3D
  },
  {
    path: '/pie',
    name: 'Pie3D',
    component: Pie3D
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
