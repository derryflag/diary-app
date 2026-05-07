<template>
  <div class="chart-view">
    <div class="chart-header">
      <button class="back-btn" @click="goHome">返回</button>
      <h1>3D 饼图</h1>
    </div>
    <div ref="chartRef" class="chart-container"></div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'

export default {
  name: 'Pie3D',
  setup() {
    const router = useRouter()
    const chartRef = ref(null)
    let chartInstance = null
    const highlightedIndex = ref(-1)

    const goHome = () => {
      router.push('/')
    }

    const data = [
      { name: '透平', value: 30 },
      { name: '核电', value: 22 },
      { name: '往复', value: 12 },
      { name: '齿轮', value: 10 },
      { name: '安检', value: 9 },
      { name: '通用', value: 8 },
      { name: '本部', value: 5 },
      { name: '其它', value: 1 },
      { name: '自控', value: 4 }
    ]

    const colors = [
      { main: '#667eea', dark: '#4a5cb8', light: '#8a9fff' },
      { main: '#4facfe', dark: '#3a8ade', light: '#6fc9ff' },
      { main: '#43e97b', dark: '#32b95e', light: '#74f3a3' },
      { main: '#fa709a', dark: '#c8597a', light: '#fc9bb8' },
      { main: '#f093fb', dark: '#c075c8', light: '#f5b7fc' },
      { main: '#00f2fe', dark: '#00c2ce', light: '#33f5ff' },
      { main: '#a8edea', dark: '#86bebc', light: '#caf3f0' },
      { main: '#ff9a9e', dark: '#cc7b7e', light: '#ffc4c6' },
      { main: '#fbc2eb', dark: '#c99bbc', light: '#fcd8f3' }
    ]

    const initChart = () => {
      if (!chartRef.value) return

      chartInstance = echarts.init(chartRef.value)

      const width = chartRef.value.offsetWidth
      const height = chartRef.value.offsetHeight
      const centerX = width / 2
      const centerY = height / 2
      const radius = Math.min(width, height) * 0.28
      const thickness = 45

      function renderItem(params, api) {
        const categoryIndex = api.value(0)
        const value = api.value(1)
        
        const total = data.reduce((sum, item) => sum + item.value, 0)
        const angle = (value / total) * Math.PI * 2
        
        let startAngle = 0
        for (let i = 0; i < categoryIndex; i++) {
          startAngle += (data[i].value / total) * Math.PI * 2
        }
        startAngle -= Math.PI / 2
        const endAngle = startAngle + angle
        
        const colorPair = colors[categoryIndex]
        const isHighlighted = categoryIndex === highlightedIndex.value
        const liftHeight = isHighlighted ? 25 : 0
        const scale = isHighlighted ? 1.08 : 1
        
        const children = []
        
        const segments = 30
        const midAngle = startAngle + angle / 2
        let zValue = Math.round(Math.sin(midAngle) * 100)
        if (categoryIndex === 1) {
          zValue = 200
        }
        console.log(`[${categoryIndex}] ${data[categoryIndex].name}: midAngle=${midAngle.toFixed(2)}, zValue=${zValue}`)

        const gradientColor = {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 1,
          y2: 1,
          colorStops: [
            { offset: 0, color: colorPair.light },
            { offset: 0.5, color: colorPair.main },
            { offset: 1, color: colorPair.dark }
          ]
        }
        
        const bottomPoints = []
        const topPoints = []
        const sidePoints1 = []
        const sidePoints2 = []
        
        const getPoint = (r, a, y) => [centerX + r * Math.cos(a), y + r * Math.sin(a) * 0.6]
        
        bottomPoints.push(getPoint(0, startAngle, centerY + thickness))
        topPoints.push(getPoint(0, startAngle, centerY - liftHeight))
        
        for (let i = 0; i <= segments; i++) {
          const t = i / segments
          const a = startAngle + t * angle
          
          bottomPoints.push(getPoint(radius * scale, a, centerY + thickness))
          topPoints.push(getPoint(radius * scale, a, centerY - liftHeight))
        }
        
        bottomPoints.push(getPoint(0, endAngle, centerY + thickness))
        topPoints.push(getPoint(0, endAngle, centerY - liftHeight))
        
        children.push({
          type: 'polygon',
          z2: zValue,
          shape: { points: bottomPoints },
          style: { fill: colorPair.light }
        })
        
        for (let i = 0; i < segments; i++) {
          const a1 = startAngle + (i / segments) * angle
          const a2 = startAngle + ((i + 1) / segments) * angle
          
          const points = [
            getPoint(radius * scale, a1, centerY + thickness),
            getPoint(radius * scale, a1, centerY - liftHeight),
            getPoint(radius * scale, a2, centerY - liftHeight),
            getPoint(radius * scale, a2, centerY + thickness)
          ]
          
          children.push({
            type: 'polygon',
            z2: zValue,
            shape: { points: points },
            style: { fill: colorPair.dark }
          })
        }
        
        children.push({
          type: 'polygon',
          z2: zValue,
          shape: { points: topPoints },
          style: { fill: gradientColor }
        })

        const labelR = radius * scale * 0.75
        const labelX = centerX + labelR * Math.cos(midAngle)
        const labelY = (centerY - liftHeight) + labelR * Math.sin(midAngle) * 0.35

        children.push({
          type: 'text',
          position: [labelX, labelY],
          style: {
            text: value + '%',
            fill: '#fff',
            font: 'bold 14px sans-serif',
            align: 'center'
          }
        })

        const nameR = radius * scale * 1.1
        const nameX = centerX + nameR * Math.cos(midAngle)
        const nameY = (centerY - liftHeight) + nameR * Math.sin(midAngle) * 0.35

        children.push({
          type: 'text',
          position: [nameX, nameY],
          style: {
            text: data[categoryIndex].name,
            fill: '#fff',
            font: '12px sans-serif',
            align: 'center'
          }
        })

        return {
          type: 'group',
          children: children
        }
      }

      const option = {
        backgroundColor: 'transparent',
        xAxis: {
          type: 'value',
          show: false
        },
        yAxis: {
          type: 'value',
          show: false
        },
        series: [{
          type: 'custom',
          renderItem: renderItem,
          data: data.map((item, index) => [index, item.value]),
          animationDelay: (idx) => idx * 100,
          emphasis: {
            itemStyle: {
              opacity: 1
            }
          },
          label: {
            show: false
          }
        }],
        legend: {
          show: true,
          bottom: 20,
          left: 'center',
          itemWidth: 20,
          itemHeight: 20,
          itemGap: 25,
          textStyle: {
            color: '#fff',
            fontSize: 16,
            fontWeight: 'bold'
          },
          data: data.map((item, index) => ({
            name: item.name + ' ' + item.value + '%',
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 1,
                y2: 1,
                colorStops: [
                  { offset: 0, color: colors[index].light },
                  { offset: 0.5, color: colors[index].main },
                  { offset: 1, color: colors[index].dark }
                ]
              }
            }
          }))
        },
        graphic: [
          {
            type: 'text',
            left: 50,
            top: 30,
            style: {
              text: '总额：59.43亿',
              fill: '#fff',
              font: 'bold 36px sans-serif',
              fontWeight: 'bold'
            }
          }
        ]
      }

      chartInstance.setOption(option)

      chartInstance.on('mouseover', (params) => {
        if (params.dataIndex !== undefined) {
          highlightedIndex.value = params.dataIndex
          chartInstance.setOption(option)
        }
      })

      chartInstance.on('mouseout', () => {
        highlightedIndex.value = -1
        chartInstance.setOption(option)
      })
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
  height: 700px;
  background: linear-gradient(135deg, #0a1931 0%, #1a3a5c 50%, #0d2847 100%);
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(91, 155, 213, 0.3);
}

@media (max-width: 768px) {
  .chart-container {
    height: 500px;
  }
}
</style>
