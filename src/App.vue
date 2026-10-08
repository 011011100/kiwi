<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const sceneElement = ref(null)
const error = ref('')
const state = reactive({ ready: false, mode: 'follow', moving: false, pecking: false, pecks: 0, hits: 0 })
let controller
let disposed = false

onMounted(async () => {
  try {
    const { createKiwiGarden } = await import('./kiwi/createKiwiGarden.js')
    if (disposed || !sceneElement.value) return
    controller = createKiwiGarden(sceneElement.value, {
      onState(nextState) {
        if (!disposed) Object.assign(state, nextState)
      },
      onError(message) {
        if (!disposed) error.value = message || '场景暂时无法打开，请刷新页面重试。'
      }
    })
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error && cause.message
      ? cause.message
      : '场景暂时无法打开，请刷新页面重试。'
  }
})

onBeforeUnmount(() => {
  disposed = true
  controller?.dispose()
})
</script>

<template>
  <main
    id="garden"
    class="garden"
    aria-label="几维鸟互动场景"
    :data-ready="state.ready && !error"
    :data-mode="state.mode"
    :data-moving="state.moving"
    :data-pecking="state.pecking"
    :data-pecks="state.pecks"
    :data-hits="state.hits"
  >
    <div ref="sceneElement" class="scene"></div>
    <p v-if="error" class="scene-message" role="alert">{{ error }}</p>
    <p v-else-if="!state.ready" class="scene-message" role="status">正在打开场景…</p>
    <div v-else id="play-instructions" class="instructions" aria-label="操作说明">
      <span class="desktop-controls">移动鼠标跟随 · <kbd>↑ ↓ ← →</kbd> / <kbd>W A S D</kbd> 行走 · 点击 / <kbd>空格</kbd> 啄击</span>
      <span class="touch-controls">拖动行走 · 轻点啄击</span>
      <span>走近可推方块，草丛和蘑菇都可以啄。</span>
    </div>
  </main>
</template>
