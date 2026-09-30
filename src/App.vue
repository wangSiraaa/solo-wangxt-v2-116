<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <h1>本地乐谱排练台</h1>
        <p>明确记号构造演奏路径 · Web Audio 节拍参考 · IndexedDB 本地工程 · 纯前端</p>
      </div>
      <div class="top-actions">
        <label class="button secondary">
          打开 MusicXML
          <input type="file" accept=".xml,.musicxml,application/xml,text/xml" @change="onFileSelected" />
        </label>
        <label class="button secondary">
          导入工程
          <input type="file" accept=".json,application/json" @change="onProjectImport" />
        </label>
        <button class="button primary" :disabled="!project" @click="saveCurrentProject">保存到本机</button>
        <button class="button secondary" :disabled="!project" @click="downloadOriginalXml">导出原 XML</button>
        <button class="button secondary" :disabled="!project" @click="downloadProjectBundle">导出工程包</button>
      </div>
    </header>

    <main class="workspace">
      <aside class="sidebar">
        <section class="panel">
          <h2>样例</h2>
          <div class="sample-list">
            <button v-for="sample in sampleLibrary" :key="sample.name" class="button sample" @click="loadSample(sample)">
              {{ sample.name }}
            </button>
          </div>
        </section>

        <section class="panel">
          <h2>本机工程</h2>
          <div v-if="projects.length === 0" class="muted">IndexedDB 中还没有工程。</div>
          <div v-for="item in projects" :key="item.id" class="project-row">
            <button class="link-button" @click="loadStoredProject(item)">{{ item.name }}</button>
            <small>{{ formatDate(item.updatedAt) }} · {{ item.marks.length }} 标记</small>
            <button class="danger" @click="removeStoredProject(item.id)">删除</button>
          </div>
        </section>

        <section class="panel status-panel">
          <h2>路径状态</h2>
          <div :class="['status-badge', path?.closed ? 'ok' : 'bad']">
            {{ path?.closed ? '路径可闭合' : '路径存在错误' }}
          </div>
          <div v-if="path" class="stat-grid">
            <span>实际小节</span><strong>{{ path.steps.length }}</strong>
            <span>书面小节</span><strong>{{ score?.measures.length ?? 0 }}</strong>
            <span>总时长</span><strong>{{ formatTime(path.totalSeconds) }}</strong>
          </div>
        </section>
      </aside>

      <section class="score-column">
        <div class="transport panel">
          <button class="button primary" :disabled="!path" @click="togglePlayback">{{ playing ? '暂停' : '播放/节拍' }}</button>
          <button class="button secondary" :disabled="!path" @click="stopPlayback">停止</button>
          <label>
            起始书面小节
            <select v-model.number="selectedMeasureIndex" :disabled="!score">
              <option v-for="measure in score?.measures ?? []" :key="measure.index" :value="measure.index">
                {{ measure.number }} {{ measure.isPickup ? '（弱起）' : '' }}
              </option>
            </select>
          </label>
          <label>
            到达次数
            <select v-model.number="selectedOccurrence" :disabled="!selectedOccurrences.length">
              <option v-for="occurrence in selectedOccurrences" :key="occurrence" :value="occurrence">
                第 {{ occurrence }} 次到达
              </option>
            </select>
          </label>
          <div class="timeline">
            <div class="timeline-bar"><div :style="{ width: `${playProgress * 100}%` }" /></div>
            <span>{{ formatTime(currentScoreTime) }} / {{ path ? formatTime(path.totalSeconds) : '0:00.0' }}</span>
          </div>
        </div>

        <div class="score-wrap">
          <ScoreView
            v-if="project && score && path"
            :xml="project.originalXml"
            :measures="score.measures"
            :path="path"
            :active-step-index="activeStepIndex"
            interactable
            @select-measure="chooseMeasure"
          />
          <div v-else class="empty-state">
            <strong>请打开一个 MusicXML 或加载样例。</strong>
            <p>所有数据只保存在当前浏览器；原始 XML 不会被重写。</p>
          </div>
        </div>
      </section>

      <aside class="sidebar right">
        <section class="panel">
          <h2>选定书面小节的实际到达</h2>
          <div v-if="selectedMeasure" class="measure-detail">
            <div class="detail-title">
              书面小节 {{ selectedMeasure.number }}
              <span v-if="selectedMeasure.isPickup" class="tag">弱起</span>
              <span v-if="selectedMeasure.hasMultipleVoices" class="tag">多声部</span>
              <span v-if="selectedMeasure.endings.length" class="tag">跳房</span>
            </div>
            <p v-if="!selectedOccurrences.length" class="muted">这个书面小节在当前演奏路径中不会被演奏。</p>
            <button
              v-for="occurrence in selectedOccurrences"
              :key="occurrence"
              :class="['arrival-button', { selected: occurrence === selectedOccurrence }]"
              @click="selectedOccurrence = occurrence"
            >
              第 {{ occurrence }} 次到达 · {{ arrivalDescription(occurrence) }}
            </button>
          </div>
        </section>

        <section class="panel path-panel">
          <h2>实际演奏路径</h2>
          <div class="path-list">
            <button
              v-for="(step, index) in path?.steps ?? []"
              :key="`${step.measureIndex}-${step.occurrence}`"
              :class="['path-step', { active: index === activeStepIndex }]"
              @click="seekToStep(index)"
            >
              <span class="step-order">{{ index + 1 }}</span>
              <span class="step-main">
                小节 {{ step.measureNumber }} <em>#{{ step.occurrence }}</em>
                <small>{{ step.event }} · ♩={{ Math.round(step.bpm) }}</small>
              </span>
              <span class="step-time">{{ formatTime(step.startSeconds) }}</span>
            </button>
          </div>
        </section>

        <section class="panel">
          <h2>排练标记（独立保存）</h2>
          <div class="mark-form">
            <input v-model="markLabel" placeholder="标记名，如 A2" />
            <textarea v-model="markComment" placeholder="排练说明，不写回 XML" />
            <button class="button primary" :disabled="!project" @click="addMark">给当前到达位置加标记</button>
          </div>
          <div class="mark-list">
            <article v-for="mark in project?.marks ?? []" :key="mark.id">
              <strong>{{ mark.label }}</strong>
              <p>{{ mark.comment }}</p>
              <small>书面小节 {{ score?.measures[mark.measureIndex]?.number }} · 第 {{ mark.occurrence }} 次</small>
              <button @click="removeMark(mark.id)">移除</button>
            </article>
          </div>
        </section>

        <section class="panel warnings-panel">
          <h2>记号诊断（不静默忽略）</h2>
          <p v-if="!path?.warnings.length" class="muted">没有诊断信息。</p>
          <div v-for="(warning, index) in path?.warnings ?? []" :key="index" :class="['warning', warning.level]">
            <strong>{{ warning.level === 'error' ? '错误' : warning.level === 'warning' ? '警告' : '信息' }}</strong>
            <span>{{ warning.message }}</span>
          </div>
        </section>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ScoreView from './components/ScoreView.vue'
import { buildBeatEvents, Metronome, type BeatEvent } from './audio/metronome'
import {
  createProject,
  deleteProject,
  downloadText,
  exportProject,
  importProjectFile,
  listProjects,
  saveProject,
} from './storage/projects'
import { arrivalsFor, buildPerformancePath, formatTime, parseMusicXml, type ParsedScore } from './score/parser'
import { sampleLibrary } from './score/samples'
import type { RehearsalMark, StoredProject } from './score/types'

const projects = ref<StoredProject[]>([])
const project = ref<StoredProject | null>(null)
const score = ref<ParsedScore | null>(null)
const path = ref<ReturnType<typeof buildPerformancePath> | null>(null)
const selectedMeasureIndex = ref(0)
const selectedOccurrence = ref(1)
const activeStepIndex = ref<number | null>(null)
const currentScoreTime = ref(0)
const playing = ref(false)
const markLabel = ref('')
const markComment = ref('')
const beatEvents = ref<BeatEvent[]>([])
let metronome: Metronome | null = null
let rafHandle = 0

const selectedMeasure = computed(() => score.value?.measures[selectedMeasureIndex.value] ?? null)
const selectedOccurrences = computed(() => path.value ? arrivalsFor(path.value, selectedMeasureIndex.value) : [])
const playProgress = computed(() => path.value && path.value.totalSeconds > 0 ? currentScoreTime.value / path.value.totalSeconds : 0)

async function refreshProjectList(): Promise<void> {
  projects.value = await listProjects()
}

function analyze(xml: string): void {
  const parsed = parseMusicXml(xml)
  score.value = parsed
  path.value = buildPerformancePath(parsed)
  beatEvents.value = buildBeatEvents(path.value.steps, parsed.measures)
  selectedMeasureIndex.value = 0
  selectedOccurrence.value = path.value.arrivals[0]?.occurrences[0] ?? 1
  stopPlayback()
}

function loadXml(name: string, xml: string): void {
  project.value = createProject(name, xml)
  analyze(xml)
  void refreshProjectList()
}

function loadSample(sample: { name: string; getXml: () => string }): void {
  loadXml(sample.name, sample.getXml())
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.name.toLowerCase().endsWith('.mxl')) {
    window.alert('压缩 .mxl 尚未列入明确支持范围。请解压为 .musicxml/.xml 后打开。')
    return
  }
  loadXml(file.name.replace(/\.(musicxml|xml)$/i, ''), await file.text())
  input.value = ''
}

function loadStoredProject(item: StoredProject): void {
  project.value = JSON.parse(JSON.stringify(item)) as StoredProject
  analyze(project.value.originalXml)
}

async function saveCurrentProject(): Promise<void> {
  if (!project.value) return
  project.value.updatedAt = new Date().toISOString()
  await saveProject(project.value)
  await refreshProjectList()
}

async function removeStoredProject(id: string): Promise<void> {
  await deleteProject(id)
  await refreshProjectList()
}

async function onProjectImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const imported = await importProjectFile(file)
    await saveProject(imported)
    await refreshProjectList()
    loadStoredProject(imported)
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '工程导入失败')
  } finally {
    input.value = ''
  }
}

function downloadOriginalXml(): void {
  if (!project.value) return
  downloadText(`${project.value.name}.musicxml`, project.value.originalXml, 'application/vnd.recordare.musicxml+xml')
}

function downloadProjectBundle(): void {
  if (!project.value) return
  const bundle = exportProject(project.value)
  downloadText(`${project.value.name}.rehearsal.json`, JSON.stringify(bundle, null, 2), 'application/json')
}

function seekToStep(index: number): void {
  activeStepIndex.value = index
  const step = path.value?.steps[index]
  if (step) {
    currentScoreTime.value = step.startSeconds
    selectedMeasureIndex.value = step.measureIndex
    selectedOccurrence.value = step.occurrence
  }
}

function chooseMeasure(measureIndex: number): void {
  selectedMeasureIndex.value = measureIndex
  const occurrences = path.value ? arrivalsFor(path.value, measureIndex) : []
  selectedOccurrence.value = occurrences[0] ?? 1
  const stepIndex = path.value?.steps.findIndex((step) => step.measureIndex === measureIndex && step.occurrence === selectedOccurrence.value) ?? -1
  if (stepIndex >= 0) seekToStep(stepIndex)
}

function findSelectedStepIndex(): number {
  return path.value?.steps.findIndex(
    (step) => step.measureIndex === selectedMeasureIndex.value && step.occurrence === selectedOccurrence.value,
  ) ?? -1
}

async function startPlayback(): Promise<void> {
  if (!path.value) return
  let stepIndex = findSelectedStepIndex()
  if (stepIndex < 0) stepIndex = 0
  const startTime = path.value.steps[stepIndex]?.startSeconds ?? 0
  metronome ??= new Metronome((event) => {
    activeStepIndex.value = event.stepIndex
  })
  await metronome.start(beatEvents.value, currentScoreTime.value >= startTime ? currentScoreTime.value : startTime)
  playing.value = true
  tick()
}

function tick(): void {
  if (!metronome || !playing.value) return
  currentScoreTime.value = metronome.currentTime
  const position = metronome.positionAt(currentScoreTime.value)
  if (position) activeStepIndex.value = position.stepIndex
  if (path.value && currentScoreTime.value >= path.value.totalSeconds) {
    stopPlayback()
    return
  }
  rafHandle = window.requestAnimationFrame(tick)
}

function pausePlayback(): void {
  if (metronome) currentScoreTime.value = metronome.currentTime
  metronome?.stop()
  playing.value = false
  cancelAnimationFrame(rafHandle)
}

function stopPlayback(): void {
  metronome?.stop()
  playing.value = false
  cancelAnimationFrame(rafHandle)
  const firstIndex = findSelectedStepIndex()
  activeStepIndex.value = firstIndex >= 0 ? firstIndex : null
  currentScoreTime.value = firstIndex >= 0 ? path.value?.steps[firstIndex].startSeconds ?? 0 : 0
}

async function togglePlayback(): Promise<void> {
  if (playing.value) pausePlayback()
  else await startPlayback()
}

function arrivalDescription(occurrence: number): string {
  const step = path.value?.steps.find((item) => item.measureIndex === selectedMeasureIndex.value && item.occurrence === occurrence)
  if (!step) return '未到达'
  return `${step.event}，${formatTime(step.startSeconds)}`
}

function addMark(): void {
  if (!project.value) return
  const mark: RehearsalMark = {
    id: crypto.randomUUID(),
    measureIndex: selectedMeasureIndex.value,
    occurrence: selectedOccurrence.value,
    label: markLabel.value || `小节 ${selectedMeasure.value?.number}`,
    comment: markComment.value,
    color: '#f4b942',
    createdAt: new Date().toISOString(),
  }
  project.value.marks.push(mark)
  markLabel.value = ''
  markComment.value = ''
  void saveCurrentProject()
}

function removeMark(id: string): void {
  if (!project.value) return
  project.value.marks = project.value.marks.filter((mark) => mark.id !== id)
  void saveCurrentProject()
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

watch(selectedMeasureIndex, () => {
  const occurrences = path.value ? arrivalsFor(path.value, selectedMeasureIndex.value) : []
  if (!occurrences.includes(selectedOccurrence.value)) selectedOccurrence.value = occurrences[0] ?? 1
})

watch(selectedOccurrence, () => {
  const index = findSelectedStepIndex()
  if (index >= 0 && activeStepIndex.value !== index) seekToStep(index)
})

watch(project, () => {
  if (project.value) void saveProject(project.value).then(refreshProjectList)
}, { deep: true })

onBeforeUnmount(() => {
  stopPlayback()
})

void refreshProjectList()
loadSample(sampleLibrary[0])
</script>
