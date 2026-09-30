<script setup lang="ts">
import type { Diagnostic } from '../types/score';
defineProps<{ diagnostics: Diagnostic[] }>();
</script>

<template>
  <section class="panel stack">
    <div>
      <h2>记号与闭合诊断</h2>
      <p class="small">不认识的导航符号或找不到目标的 D.C./D.S./Coda/Fine 会在这里明确报错，不会静默忽略。</p>
    </div>
    <div v-if="!diagnostics.length" class="diagnostic info">未发现记号问题；若谱中没有速度，将使用默认 ♩=90。</div>
    <div v-for="(item, index) in diagnostics" :key="index" class="diagnostic" :class="item.severity">
      <strong>{{ item.severity === 'error' ? '错误' : item.severity === 'warning' ? '警告' : '信息' }} · {{ item.code }}</strong>
      <div>{{ item.message }}</div>
      <div v-if="item.measureIndex !== undefined" class="small">位置：书面小节 {{ item.measureLabel ?? item.measureIndex + 1 }}</div>
    </div>
  </section>
</template>
