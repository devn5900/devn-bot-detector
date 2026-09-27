<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { BotDetector, type RiskResult } from 'devn-bot-detector-client'

const result = ref<RiskResult | null>(null)
const detector = new BotDetector({
  siteKey: 'site_ok',
  endpoint: 'http://localhost:8787',
  autoStart: false,
  failOpen: true,
})

onMounted(async () => {
  await detector.start()
})

onUnmounted(() => {
  detector.destroy()
})

async function submit() {
  const risk = await detector.check()
  result.value = risk
  if (risk.decision === 'block') return
  // continue with application submit
}
</script>

<template>
  <div>
    <h1>Vue example</h1>
    <button type="button" @click="submit">Submit with risk check</button>
    <pre v-if="result">{{ result }}</pre>
  </div>
</template>
