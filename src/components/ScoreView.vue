<template>
  <div ref="hostRef" class="score-host" :class="{ interactable }">
    <div ref="osmdRef" class="osmd-container" @click="onContainerClick" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type * as OsmdModule from 'opensheetmusicdisplay'
import type { BuiltPath, WrittenMeasure } from '../score/types'

const props = defineProps<{
  xml: string
  measures: WrittenMeasure[]
  path: BuiltPath | null
  activeStepIndex: number | null
  interactable?: boolean
}>()

const emit = defineEmits<{
  selectMeasure: [measureIndex: number]
}>()

const hostRef = ref<HTMLDivElement>()
const osmdRef = ref<HTMLDivElement>()
type OsmdInstance = InstanceType<typeof OsmdModule.OpenSheetMusicDisplay>
let osmd: OsmdInstance | null = null
let resizeObserver: ResizeObserver | null = null
let overlay: SVGSVGElement | null = null

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

async function render(): Promise<void> {
  if (!osmdRef.value) return
  osmdRef.value.innerHTML = ''
  const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay')
  osmd = new OpenSheetMusicDisplay(osmdRef.value, {
    backend: 'svg',
    autoResize: true,
    drawingParameters: 'default',
    disableCursor: true,
  })
  osmd.setLogLevel('error')
  await osmd.load(props.xml)
  osmd.render()
  window.requestAnimationFrame(createOverlay)
}

function collectMeasureRect(measureIndex: number): Rect | null {
  if (!osmd) return null
  const measureList = osmd.GraphicSheet.MeasureList
  const graphicalMeasures = measureList[measureIndex]
  if (!graphicalMeasures?.length) return null

  const rects = graphicalMeasures
    .filter((graphicalMeasure) => graphicalMeasure && !graphicalMeasure.IsExtraGraphicalMeasure)
    .map((graphicalMeasure) => graphicalMeasure.PositionAndShape.BoundingRectangle)
  if (!rects.length) return null

  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x, y, width: right - x, height: bottom - y }
}

function createOverlay(): void {
  if (!osmdRef.value || !osmd) return
  const svg = osmdRef.value.querySelector('svg')
  if (!svg) return
  overlay?.remove()
  overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  overlay.setAttribute('class', 'measure-overlay')
  overlay.setAttribute('viewBox', svg.getAttribute('viewBox') ?? '0 0 100 100')
  overlay.setAttribute('width', svg.getAttribute('width') ?? '100%')
  overlay.setAttribute('height', svg.getAttribute('height') ?? '100%')
  svg.parentElement?.appendChild(overlay)
  drawOverlay()
}

function drawOverlay(): void {
  if (!overlay || !props.path) return
  overlay.innerHTML = ''
  const activeStep = props.activeStepIndex === null ? null : props.path.steps[props.activeStepIndex]
  const arrivedSet = new Map<number, Set<number>>()
  for (const arrival of props.path.arrivals) arrivedSet.set(arrival.measureIndex, new Set(arrival.occurrences))

  for (const measure of props.measures) {
    const rect = collectMeasureRect(measure.index)
    if (!rect) continue
    const isActive = activeStep?.measureIndex === measure.index
    const arrivals = arrivedSet.get(measure.index)
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    group.dataset.measureIndex = String(measure.index)

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    hit.setAttribute('x', String(rect.x))
    hit.setAttribute('y', String(rect.y))
    hit.setAttribute('width', String(rect.width))
    hit.setAttribute('height', String(rect.height))
    hit.setAttribute('class', 'measure-hit')
    hit.addEventListener('click', () => emit('selectMeasure', measure.index))
    group.appendChild(hit)

    if (arrivals?.size) {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      marker.setAttribute('x', String(rect.x))
      marker.setAttribute('y', String(rect.y))
      marker.setAttribute('width', String(rect.width))
      marker.setAttribute('height', String(rect.height))
      marker.setAttribute('class', 'measure-arrival')
      group.appendChild(marker)

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      label.textContent = `×${arrivals.size}`
      label.setAttribute('x', String(rect.x + rect.width - 6))
      label.setAttribute('y', String(rect.y + 10))
      label.setAttribute('class', 'arrival-label')
      label.addEventListener('click', () => emit('selectMeasure', measure.index))
      group.appendChild(label)
    }

    if (isActive) {
      const active = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      active.setAttribute('x', String(rect.x))
      active.setAttribute('y', String(rect.y))
      active.setAttribute('width', String(rect.width))
      active.setAttribute('height', String(rect.height))
      active.setAttribute('class', `measure-active ${activeStep?.activeEndingNumbers.length ? 'in-ending' : ''}`)
      group.appendChild(active)
    }

    overlay.appendChild(group)
  }
}

function onContainerClick(event: MouseEvent): void {
  const target = event.target as Element
  const measureIndex = target.closest('[data-measure-index]')?.getAttribute('data-measure-index')
  if (measureIndex !== null && measureIndex !== undefined) emit('selectMeasure', Number(measureIndex))
}

watch(() => props.xml, render, { immediate: true })
watch(() => [props.activeStepIndex, props.path], drawOverlay)
watch(() => props.measures, () => window.setTimeout(drawOverlay, 80))

resizeObserver = new ResizeObserver(() => window.setTimeout(drawOverlay, 100))
if (hostRef.value) resizeObserver.observe(hostRef.value)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  overlay?.remove()
  osmd?.clear()
})
</script>
