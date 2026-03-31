<template>
  <div class="chart-view">
    <div class="chart-header">
      <button class="back-btn" @click="goHome">返回</button>
      <h1>伪3D 柱状图</h1>
    </div>
    <div ref="chartRef" class="chart-container"></div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'

export default {
  name: 'Chart3D',
  setup() {
    const router = useRouter()
    const chartRef = ref(null)
    let chartInstance = null

    const goHome = () => {
      router.push('/')
    }

    const data = [
      { month: '1月', value: 22 },
      { month: '2月', value: 20 },
      { month: '3月', value: 18 },
      { month: '4月', value: 16 },
      { month: '5月', value: 15 },
      { month: '6月', value: 12 },
      { month: '7月', value: 10 },
      { month: '8月', value: 5 }
    ]

    const colors = [
      '#7c3aed', '#73c0de', '#1e40af', '#d97706', 
      '#fc8452', '#dc2626', '#3ba272', '#fcd34d'
    ]

    const initChart = () => {
      if (!chartRef.value) return

      chartInstance = echarts.init(chartRef.value)

      const barSize = 50

      function renderBar(params, api) {
        const categoryIndex = api.value(0)
        const value = api.value(1)
        
        const start = api.coord([categoryIndex, value])
        const basePoint = api.coord([categoryIndex, 0])
        
        const barHeight = basePoint[1] - start[1]
        
        const x = start[0]
        const topY = start[1]
        const bottomY = basePoint[1]
        
        const halfW = barSize / 2
        const halfH = barSize * 0.2
        const skewY = halfW * 0.3
        
        const topFace = [
          [x - halfW, topY],
          [x, topY - halfH],
          [x + halfW, topY],
          [x, topY + halfH]
        ]
        
        const frontFace = [
          [x - halfW, topY],
          [x, topY + halfH],
          [x, bottomY],
          [x - halfW, bottomY - halfH]
        ]
        
        const sideFace = [
          [x, topY + halfH],
          [x + halfW, topY],
          [x + halfW, bottomY - halfH],
          [x, bottomY]
        ]
        
        const color = colors[categoryIndex]
        const darkColor = echarts.color.lift(color, -0.5)
        const lightColor = echarts.color.lift(color, 0.5)
        
        return {
          type: 'group',
          children: [
            {
              type: 'polygon',
              shape: { points: topFace },
              style: { fill: color }
            },
            {
              type: 'polygon',
              shape: { points: frontFace },
              style: { 
                fill: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: color },
                  { offset: 1, color: lightColor }
                ])
              }
            },
            {
              type: 'polygon',
              shape: { points: sideFace },
              style: { 
                fill: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: darkColor },
                  { offset: 1, color: lightColor }
                ])
              }
            }
          ]
        }
      }

      const option = {
        grid: {
          left: '5%',
          right: '5%',
          top: '15%',
          bottom: '10%'
        },
        xAxis: {
          type: 'category',
          data: data.map(item => item.month),
          axisLine: { lineStyle: { color: '#4a6fa5' } },
          axisLabel: { color: '#8cb2e0', fontSize: 12 },
          axisTick: { show: false }
        },
        yAxis: {
          type: 'value',
          name: '数量',
          nameTextStyle: { color: '#8cb2e0', fontSize: 12 },
          axisLine: { show: false },
          axisLabel: { color: '#8cb2e0' },
          splitLine: { lineStyle: { color: '#1a3a5c' } }
        },
        series: [{
          type: 'custom',
          renderItem: renderBar,
          data: data.map((item, index) => [index, item.value]),
          animationDelay: (idx) => idx * 100
        }]
      }

      chartInstance.setOption(option)
    }

    const handleResize = () => {
      if (chartInstance) {
        chartInstance.resize()
      }
    }

    onMounted(() => {
      initChart()
      window.addEventListener('resize', handleResize)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', handleResize)
      if (chartInstance) {
        chartInstance.dispose()
      }
    })

    return {
      chartRef,
      goHome
    }
  }
}
</script>

<style scoped>
.chart-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.chart-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
}

.chart-header h1 {
  background: linear-gradient(135deg, #85c285, #5b9bd5);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.back-btn {
  background: linear-gradient(135deg, #85c285, #6bb36b);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.back-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(133, 194, 133, 0.4);
}

.chart-container {
  width: 100%;
  height: 600px;
  background: linear-gradient(90deg, #001133 0%, #0a1931 50%, #000000 100%);
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(91, 155, 213, 0.15);
}

@media (max-width: 768px) {
  .chart-container {
    height: 400px;
  }
}
</style>
