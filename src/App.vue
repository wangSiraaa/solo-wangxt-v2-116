<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import ScoreDisplay from './components/ScoreDisplay.vue';
import PathPanel from './components/PathPanel.vue';
import DiagnosticsPanel from './components/DiagnosticsPanel.vue';
import { parseMusicXml } from './lib/musicXmlParser';
import { Metronome } from './lib/metronome';
import { ScoreViewer } from './lib/scoreViewer';
import { createMark, createProject, deleteProject, loadProjects, saveProject } from './lib/storage';
import { buildAnnotatedMusicXml, buildProjectExport } from './lib/exportProject';
import { downloadText, formatTime, safeFilename } from './lib/dom';
import { samples } from './samples/musicXmlSamples';
import type { BeatEvent, ParsedScore, PathStep, StoredProject } from './types/score';

const xml = ref<string | null>(null);
const score = ref<ParsedScore | null>(null);
const viewer = shallowRef<ScoreViewer | null>(null);
const projects = ref<StoredProject[]>([]);
const currentProject = ref<StoredProject | null>(null);
const selectedMeasure = ref<number | null>(null);
const selectedOccurrence = ref<number | null>(null);
const activeOccurrence = ref<number | null>(null);
const activeBeat = ref<BeatEvent | null>(null);
const currentSeconds = ref(0);
const metronomeEnabled = ref(true);
const playFromSelected = ref(false);
const markLabel = ref('');
const markNote = ref('');
const fileError = ref('');

const metronome = new Metronome();
metronome.onTick = (_index, performanceTime) => {
  currentSeconds.value = performanceTime;
};
metronome.onEnd = () => {
  activeBeat.value = null;
  activeOccurrence.value = null;
  viewer.value?.reset();
};

const fatal = computed(() => score.value?.diagnostics.some((d) => d.severity === 'error') ?? false);

function ingestScore(nextXml: string, project?: StoredProject): void {
  xml.value = nextXml;
  score.value = parseMusicXml(nextXml);
  currentProject.value = project ?? createProject(score.value.title, nextXml);
  selectedMeasure.value = null;
  selectedOccurrence.value = null;
  activeOccurrence.value = null;
  activeBeat.value = null;
  currentSeconds.value = 0;
  void persistCurrent();
}

async function persistCurrent(): Promise<void> {
  if (!currentProject.value || !xml.value) return;
  await saveProject(currentProject.value);
  await refreshProjects();
}

async function refreshProjects(): Promise<void> {
  projects.value = await loadProjects();
}

async function onFile(file: File | undefined): Promise<void> {
  if (!file) return;
  fileError.value = '';
  if (file.name.toLowerCase().endsWith('.mxl')) {
    fileError.value = '当前纯前端示例只接受未压缩 .musicxml/.xml；.mxl 压缩包需先解压。';
    return;
  }
  ingestScore(await file.text());
}

function loadSample(id: string): void {
  const sample = samples.find((item) => item.id === id);
  if (sample) ingestScore(sample.xml);
}

function onViewerLoaded(nextViewer: ScoreViewer): void {
  viewer.value = nextViewer;
}

function selectMeasure(index: number | null): void {
  selectedMeasure.value = index;
  selectedOccurrence.value = index === null ? null : score.value?.path.find((step) => step.measureIndex === index)?.occurrence ?? null;
}

function occurrenceStep(occurrence: number | null): PathStep | undefined {
  return score.value?.path.find((step) => step.occurrence === occurrence);
}

function previewOccurrence(step: PathStep): void {
  selectedOccurrence.value = step.occurrence;
  activeOccurrence.value = step.occurrence;
  currentSeconds.value = step.startTimeSeconds;
  viewer.value?.advanceToMeasure(step.measureIndex);
}

function startEvents(): BeatEvent[] {
  if (!score.value) return [];
  const fromOccurrence = playFromSelected.value ? selectedOccurrence.value : null;
  const step = occurrenceStep(fromOccurrence);
  const startTime = step?.startTimeSeconds ?? 0;
  return score.value.events.filter((event) => event.time >= startTime - 1e-6);
}

async function play(): Promise<void> {
  if (!score.value || fatal.value || !viewer.value) return;
  const events = startEvents();
  if (!events.length) return;
  const firstStep = score.value.path.find((step) => step.endTimeSeconds >= events[0]!.time - 1e-6);
  if (firstStep) {
    viewer.value.advanceToMeasure(firstStep.measureIndex);
    activeOccurrence.value = firstStep.occurrence;
  }
  metronome.enabled = metronomeEnabled.value;
  metronome.load(events);
  await metronome.start(events[0]?.time ?? 0);
}

function stop(): void {
  metronome.stop();
  activeBeat.value = null;
  currentSeconds.value = 0;
  activeOccurrence.value = null;
  viewer.value?.reset();
}

function addMark(): void {
  if (!currentProject.value || selectedOccurrence.value === null) return;
  const step = occurrenceStep(selectedOccurrence.value);
  if (!step) return;
  currentProject.value.marks.push(createMark({
    measureIndex: step.measureIndex,
    occurrence: step.occurrence,
    label: markLabel.value || `排练标记 ${currentProject.value.marks.length + 1}`,
    note: markNote.value
  }));
  markLabel.value = '';
  markNote.value = '';
  void persistCurrent();
}

async function removeMark(id: string): Promise<void> {
  if (!currentProject.value) return;
  currentProject.value.marks = currentProject.value.marks.filter((mark) => mark.id !== id);
  await persistCurrent();
}

function openProject(project: StoredProject): void {
  ingestScore(project.xml, project);
}

async function removeProject(id: string): Promise<void> {
  await deleteProject(id);
  if (currentProject.value?.id === id) stop();
  await refreshProjects();
}

function exportOriginalXml(): void {
  if (!currentProject.value) return;
  downloadText(`${safeFilename(currentProject.value.title)}.musicxml`, currentProject.value.xml, 'application/vnd.recordare.musicxml+xml');
}

function exportAnnotatedXml(): void {
  if (!currentProject.value) return;
  downloadText(`${safeFilename(currentProject.value.title)}.annotated.musicxml`, buildAnnotatedMusicXml(currentProject.value), 'application/vnd.recordare.musicxml+xml');
}

function exportBundle(): void {
  if (!currentProject.value) return;
  const payload = buildProjectExport(currentProject.value);
  downloadText(`${safeFilename(currentProject.value.title)}.rehearsal.json`, JSON.stringify(payload, null, 2), 'application/json');
}

watch(currentSeconds, (time) => {
  if (!score.value) return;
  const beat = score.value.events.filter((event) => event.time <= time + 1e-6).at(-1) ?? null;
  activeBeat.value = beat;
  if (beat && beat.stepOccurrence !== activeOccurrence.value) {
    activeOccurrence.value = beat.stepOccurrence;
    const step = occurrenceStep(beat.stepOccurrence);
    if (step) viewer.value?.advanceToMeasure(step.measureIndex);
  }
});

void refreshProjects();
</script>

<template>
  <main class="app-shell">
    <aside class="panel stack">
      <div class="app-header">
        <div>
          <h1>MusicXML 排练台</h1>
          <p class="small">Vue 3 + TypeScript + OSMD + Web Audio + IndexedDB</p>
        </div>
      </div>

      <div class="stack">
        <h2>工程</h2>
        <input type="file" accept=".xml,.musicxml,application/xml,text/xml" @change="onFile(($event.target as HTMLInputElement).files?.[0])" />
        <div v-if="fileError" class="diagnostic error">{{ fileError }}</div>
        <div class="row">
          <button v-for="sample in samples" :key="sample.id" @click="loadSample(sample.id)">{{ sample.title }}</button>
        </div>
      </div>

      <div class="stack">
        <h2>节拍参考</h2>
        <label class="row"><input v-model="metronomeEnabled" type="checkbox" /> 启用点击（重音为小节首拍）</label>
        <label class="row"><input v-model="playFromSelected" type="checkbox" :disabled="selectedOccurrence === null" /> 从选中的实际位置开始</label>
        <div class="row">
          <button class="primary" :disabled="!score || fatal" @click="play">播放/同步</button>
          <button :disabled="!score" @click="stop">停止</button>
          <strong>{{ formatTime(currentSeconds) }}</strong>
          <span v-if="activeBeat" class="small">/ 书面 {{ activeBeat.beatLabel }}</span>
        </div>
      </div>

      <DiagnosticsPanel v-if="score" :diagnostics="score.diagnostics" />

      <div class="stack">
        <h2>本地 IndexedDB 工程</h2>
        <div v-if="!projects.length" class="small">尚无已保存工程；打开谱例会自动保存。</div>
        <div v-for="project in projects" :key="project.id" class="project-item mark-card">
          <button @click="openProject(project)">{{ project.title }} <span class="small">({{ project.marks.length }} 标记)</span></button>
          <button class="danger" @click="removeProject(project.id)">删除</button>
        </div>
      </div>
    </aside>

    <section class="panel stack">
      <div class="row">
        <h2 style="margin:0">{{ score?.title ?? '请打开 MusicXML' }}</h2>
        <span class="spacer"></span>
        <button :disabled="!currentProject" @click="exportOriginalXml">导出原 XML</button>
        <button :disabled="!currentProject" @click="exportAnnotatedXml">导出带独立标记 XML</button>
        <button :disabled="!currentProject" @click="exportBundle">导出标记 JSON</button>
      </div>
      <ScoreDisplay v-if="xml" :xml="xml" @loaded="onViewerLoaded" @error="(message) => fileError = message" />
      <div v-else class="empty-score">
        <div>
          <h2>加载谱例开始</h2>
          <p>支持未压缩的 partwise MusicXML。路径闭合诊断会在播放前执行。</p>
        </div>
      </div>
    </section>

    <aside class="panel stack">
      <div v-if="score">
        <h2>书面小节</h2>
        <div class="measure-grid">
          <button
            v-for="measure in score.measures"
            :key="measure.index"
            class="measure-chip"
            :class="{ active: selectedMeasure === measure.index, pickup: measure.isPickup }"
            @click="selectMeasure(measure.index)"
          >
            <strong>{{ measure.isPickup ? `弱起(${measure.number})` : measure.number }}</strong>
            <br />
            <span class="small">{{ measure.durationQuarters }}♕</span>
            <span v-if="measure.tempoEvents.length" class="badge tempo">速度</span>
            <span v-if="measure.activeEndingNumbers.length" class="badge ending">{{ measure.activeEndingNumbers.join('/') }}房</span>
          </button>
        </div>
      </div>

      <PathPanel
        v-if="score"
        :score="score"
        :selected-measure="selectedMeasure"
        :active-occurrence="activeOccurrence"
        @select-measure="selectMeasure($event === -1 ? null : $event)"
        @select-occurrence="previewOccurrence"
      />

      <div v-if="score" class="stack">
        <h2>独立排练标记</h2>
        <p class="small">标记引用“实际路径出现次数”，不写回也不修改原始 XML。请先在路径中选择一次到达位置。</p>
        <div class="row">
          <input v-model="markLabel" placeholder="标记名称，如 从二房后" :disabled="selectedOccurrence === null" />
        </div>
        <textarea v-model="markNote" rows="2" placeholder="排练说明（可选）"></textarea>
        <button :disabled="selectedOccurrence === null" @click="addMark">添加到 #{{ selectedOccurrence }}</button>
        <div v-for="mark in currentProject?.marks ?? []" :key="mark.id" class="mark-card stack">
          <div class="row"><strong>{{ mark.label }}</strong><span class="spacer"></span><button class="danger" @click="removeMark(mark.id)">移除</button></div>
          <div class="small">书面小节 {{ score.measures[mark.measureIndex]?.number }} · 实际出现 #{{ mark.occurrence }}</div>
          <div>{{ mark.note }}</div>
        </div>
      </div>
    </aside>
  </main>
</template>
