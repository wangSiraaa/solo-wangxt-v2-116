<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ScoreViewer } from '../lib/scoreViewer';

const props = defineProps<{ xml: string | null }>();
const emit = defineEmits<{ loaded: [viewer: ScoreViewer]; error: [message: string] }>();
const host = ref<HTMLElement | null>(null);
let viewer: ScoreViewer | null = null;
const loading = ref(false);

async function render(): Promise<void> {
  if (!host.value || !props.xml) return;
  loading.value = true;
  try {
    viewer?.dispose();
    host.value.innerHTML = '';
    viewer = new ScoreViewer(host.value);
    await viewer.load(props.xml);
    emit('loaded', viewer);
  } catch (error) {
    emit('error', error instanceof Error ? error.message : String(error));
  } finally {
    loading.value = false;
  }
}

onMounted(render);
watch(() => props.xml, render);
onBeforeUnmount(() => viewer?.dispose());

defineExpose({ getViewer: () => viewer });
</script>

<template>
  <section class="panel">
    <div class="row">
      <h2>OpenSheetMusicDisplay 乐谱</h2>
      <span v-if="loading" class="small">渲染中…</span>
    </div>
    <div ref="host" class="score-container"></div>
  </section>
</template>
