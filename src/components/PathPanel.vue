<script setup lang="ts">
import type { ParsedScore, PathStep } from '../types/score';
import { formatTime } from '../lib/dom';

const props = defineProps<{
  score: ParsedScore | null;
  selectedMeasure: number | null;
  activeOccurrence: number | null;
}>();

const emit = defineEmits<{
  selectMeasure: [measureIndex: number];
  selectOccurrence: [step: PathStep];
}>();

function visibleSteps(): PathStep[] {
  if (!props.score) return [];
  if (props.selectedMeasure === null) return props.score.path;
  return props.score.path.filter((step) => step.measureIndex === props.selectedMeasure);
}
</script>

<template>
  <section class="panel stack">
    <div>
      <h2>实际演奏路径</h2>
      <p class="small">路径由反复、跳房和返始记号显式构造；不是按书面小节编号直接递增。选择书面小节后列出它每次实际到达的位置。</p>
    </div>

    <div v-if="score" class="row">
      <button :class="{ primary: selectedMeasure === null }" @click="emit('selectMeasure', -1)">全部路径</button>
      <span class="small">共 {{ score.path.length }} 个实际小节；总时长 {{ formatTime(score.totalDurationSeconds) }}</span>
    </div>

    <div v-if="score" class="path-list">
      <button
        v-for="step in visibleSteps()"
        :key="step.occurrence"
        class="path-step"
        :class="{ active: activeOccurrence === step.occurrence, 'pass-2': step.pass === 2, 'pass-3plus': step.pass > 2 }"
        @click="emit('selectOccurrence', step)"
      >
        <strong>#{{ step.occurrence }}</strong>
        <span>
          书面小节 {{ step.measureLabel }}
          <span v-if="step.endingNumber" class="badge ending">{{ step.endingNumber }} 房</span>
          <br />
          <span class="small">第 {{ step.pass }} 遍 · {{ formatTime(step.startTimeSeconds) }}–{{ formatTime(step.endTimeSeconds) }}</span>
        </span>
        <span class="small">{{ step.durationQuarters }} 拍单位</span>
      </button>
    </div>

    <div v-if="score" class="stack">
      <h3>跳转记录</h3>
      <div class="event-log">
        <template v-for="step in score.path" :key="step.occurrence">
          <template v-for="(event, i) in step.events" :key="`${step.occurrence}-${i}`">
            #{{ step.occurrence }} m{{ step.measureLabel }}: {{ event.label }}&#10;
          </template>
        </template>
      </div>
    </div>
  </section>
</template>
