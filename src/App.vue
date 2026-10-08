<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const sceneElement = ref(null)
const error = ref('')
const state = reactive({
  mode: 'follow',
  pecks: 0,
  hits: 0,
  moving: false,
  pecking: false,
  ready: false
})
const status = computed(() => {
  if (error.value) return '暂时休息'
  if (!state.ready) return '正在醒来'
  if (state.pecking) return '认真啄一下'
  if (state.moving) return '迈着小碎步'
  return '正在东张西望'
})
const directions = [
  { direction: 'up', label: '向前走', symbol: '↑' },
  { direction: 'left', label: '向左走', symbol: '←' },
  { direction: 'down', label: '向后走', symbol: '↓' },
  { direction: 'right', label: '向右走', symbol: '→' }
]
const activeDirections = reactive(new Set())
const pointers = new Map()
const keyboardDirections = new Set()
let controller
let disposed = false

function focusGarden() {
  sceneElement.value?.querySelector('canvas')?.focus({ preventScroll: true })
}

function setMode(mode) {
  releaseAllDirections()
  state.mode = mode
  controller?.setMode(mode)
  focusGarden()
}

function peck() {
  controller?.peck()
  focusGarden()
}

function reset() {
  releaseAllDirections()
  controller?.reset()
  focusGarden()
}

function pressDirection(event, direction) {
  if (!state.ready || error.value) return
  event.preventDefault()
  if (state.mode !== 'keyboard') {
    state.mode = 'keyboard'
    controller?.setMode('keyboard')
  }
  event.currentTarget.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, direction)
  activeDirections.add(direction)
  controller?.setDirection(direction, true)
}

function releaseDirection(event) {
  const direction = pointers.get(event.pointerId)
  if (!direction) return
  pointers.delete(event.pointerId)
  if (![...pointers.values()].includes(direction) && !keyboardDirections.has(direction)) {
    activeDirections.delete(direction)
    controller?.setDirection(direction, false)
  }
}

function pressKeyboardDirection(direction) {
  if (!state.ready || error.value) return
  if (state.mode !== 'keyboard') {
    state.mode = 'keyboard'
    controller?.setMode('keyboard')
  }
  keyboardDirections.add(direction)
  activeDirections.add(direction)
  controller?.setDirection(direction, true)
}

function releaseKeyboardDirection(direction) {
  keyboardDirections.delete(direction)
  if (![...pointers.values()].includes(direction)) {
    activeDirections.delete(direction)
    controller?.setDirection(direction, false)
  }
}

function releaseAllDirections() {
  for (const direction of activeDirections) controller?.setDirection(direction, false)
  pointers.clear()
  keyboardDirections.clear()
  activeDirections.clear()
}

onMounted(async () => {
  window.addEventListener('blur', releaseAllDirections)
  try {
    const { createKiwiGarden } = await import('./kiwi/createKiwiGarden.js')
    if (disposed || !sceneElement.value) return
    controller = createKiwiGarden(sceneElement.value, {
      onState(nextState) {
        if (!disposed) Object.assign(state, nextState)
      },
      onError(message) {
        if (!disposed) error.value = message || '小花园暂时无法启动。'
      }
    })
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error && cause.message
      ? cause.message
      : '小花园暂时无法启动，请刷新页面再试一次。'
  }
})

onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('blur', releaseAllDirections)
  releaseAllDirections()
  controller?.dispose()
  controller = undefined
})
</script>

<template>
  <div class="garden-page">
    <a class="skip-link" href="#garden">去小花园玩</a>
    <header class="site-header">
      <a class="wordmark" href="./" aria-label="Kiwi Garden 首页">
        <svg class="kiwi-mark" viewBox="0 0 52 42" fill="none" aria-hidden="true">
          <path d="M33.1 15.9C31.6 9.4 26.5 5 18.9 5 8.8 5 3 12.1 3 22c0 7 5.3 12 13.5 12 9.4 0 15.9-6.4 16.6-18.1Z" fill="currentColor" />
          <circle cx="32" cy="12" r="8" fill="currentColor" />
          <path d="m37 13 13 12-16-8" fill="currentColor" />
          <path d="m13 32-2 7m13-7 2 7M8 39h7m8 0h7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          <circle cx="34" cy="10" r="1.3" fill="#f5f3eb" />
        </svg>
        <span>kiwi<span class="wordmark-italic"> garden</span></span>
      </a>
      <span class="header-note">一个有点脾气的小花园</span>
      <nav class="header-links" aria-label="相关链接">
        <a class="source-link" href="https://011011100.github.io/projects.html">返回博客</a>
        <a class="source-link" href="https://github.com/011011100/kiwi" target="_blank" rel="noopener noreferrer">
          <span>源码</span>
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 15 15 5M5 5h10v10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </a>
      </nav>
    </header>

    <main>
      <section class="introduction" aria-labelledby="page-title">
        <div>
          <p class="eyebrow"><span></span> LITTLE BIRD, BIG PERSONALITY</p>
          <h1 id="page-title">一只几维鸟，<br />一点<span class="title-italic">小脾气。</span></h1>
        </div>
        <div class="intro-note">
          <svg class="botanical-doodle" viewBox="0 0 68 60" fill="none" aria-hidden="true">
            <path d="M33 56c-2-19 0-34 10-49M34 40C21 40 11 32 8 22c15-2 25 5 26 18Zm1-12c-2-14 4-24 15-27 1 12-4 22-15 27Zm-2 22c8-12 16-15 27-12-3 10-13 15-27 12Z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <p>它不会飞，但很会跟着你。<br />带它散散步，再啄一下这个世界。</p>
          <span>MEET YOUR TINY COMPANION ↙</span>
        </div>
      </section>

      <section id="garden" class="playground" aria-label="几维鸟互动花园">
        <div class="garden-topline">
          <span class="field-label"><span class="field-number">01</span> THE GARDEN</span>
          <span class="live-status" role="status"><i :class="{ 'is-ready': state.ready && !error }"></i>{{ status }}</span>
        </div>

        <div class="scene-wrap">
          <div ref="sceneElement" class="scene" aria-label="3D 几维鸟花园，点击进入后可以用方向键走路，空格啄击"></div>
          <div v-if="!state.ready || error" class="scene-message" :class="{ 'is-error': error }" :role="error ? 'alert' : 'status'">
            <template v-if="error">
              <span class="message-symbol">☁</span>
              <h2>小花园还没准备好</h2>
              <p>{{ error }}</p>
              <p class="message-detail">请检查浏览器是否开启硬件加速，或换一个支持 WebGL 的浏览器。</p>
            </template>
            <template v-else>
              <span class="loading-dot"></span>
              <p>轻轻叫醒几维鸟…</p>
            </template>
          </div>
          <div v-if="state.ready && !error" class="scene-hint" aria-hidden="true">
            <svg v-if="state.mode === 'follow'" viewBox="0 0 20 20" fill="none"><path d="m5 3 11 7-6 1-3 5-2-13Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" /></svg>
            <span>{{ state.mode === 'follow' ? '移一移鼠标，它会跟过来' : '点击花园，用方向键开始散步' }}</span>
          </div>
          <div class="garden-counters" aria-label="互动统计">
            <div><span class="counter-value">{{ String(state.pecks).padStart(2, '0') }}</span><span class="counter-label">次啄啄</span></div>
            <span class="counter-divider"></span>
            <div><span class="counter-value">{{ String(state.hits).padStart(2, '0') }}</span><span class="counter-label">次命中</span></div>
          </div>
          <div class="specimen-label" aria-hidden="true"><span>Apteryx</span><span>小小一只，好奇心很多</span></div>
        </div>

        <div class="control-bar">
          <div class="mode-controls" role="group" aria-label="行走方式">
            <button type="button" :class="{ selected: state.mode === 'follow' }" :aria-pressed="state.mode === 'follow'" :disabled="!state.ready || !!error" @click="setMode('follow')">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 3 11 7-6 1-3 5-2-13Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" /></svg>
              鼠标跟随
            </button>
            <button type="button" :class="{ selected: state.mode === 'keyboard' }" :aria-pressed="state.mode === 'keyboard'" :disabled="!state.ready || !!error" @click="setMode('keyboard')">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="4.5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.2" /><path d="M5 8h.1M8.3 8h.1M11.6 8h.1M15 8h.1M5 11h.1M8 12h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
              键盘漫游
            </button>
          </div>
          <p class="control-tip"><span class="tip-dot"></span> 鼠标指哪儿，小脑袋就看哪儿</p>
          <button class="reset-button" type="button" :disabled="!state.ready || !!error" @click="reset">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.2 7.2A6.3 6.3 0 1 1 4 12M3.5 3.5v4.6h4.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" /></svg>
            重新开始
          </button>
        </div>
      </section>

      <section id="play-instructions" class="instructions" aria-label="操作说明">
        <div class="instruction-item"><span class="instruction-index">01 / 散步</span><p>移动鼠标，或用 <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd><span class="wasd"> / <span>W A S D</span></span></p><p class="instruction-detail">走近方块，还能推着它走。</p></div>
        <div class="instruction-item"><span class="instruction-index">02 / 啄一下</span><p>点击花园，或按 <kbd class="space-key">空格</kbd></p><p class="instruction-detail">草丛、方块、蘑菇，都可以啄。</p></div>
        <div class="touch-controls">
          <div class="direction-pad" role="group" aria-label="触屏方向控制">
            <button v-for="item in directions" :key="item.direction" type="button" :class="[item.direction, { pressed: activeDirections.has(item.direction) }]" :aria-label="item.label" :disabled="!state.ready || !!error" @pointerdown="pressDirection($event, item.direction)" @pointerup="releaseDirection" @pointercancel="releaseDirection" @lostpointercapture="releaseDirection" @keydown.space.prevent="pressKeyboardDirection(item.direction)" @keyup.space.prevent="releaseKeyboardDirection(item.direction)" @keydown.enter.prevent="pressKeyboardDirection(item.direction)" @keyup.enter.prevent="releaseKeyboardDirection(item.direction)" @blur="releaseKeyboardDirection(item.direction)">{{ item.symbol }}</button>
          </div>
          <button type="button" class="peck-button" :disabled="!state.ready || !!error" @click="peck">啄！<span>PECK</span></button>
        </div>
      </section>

      <footer class="page-footer"><span>不用赶路，随便走走。</span><span>MADE FOR A LITTLE MOMENT OF JOY <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13s-5.5-3.4-5.5-7A2.7 2.7 0 0 1 8 5.3 2.7 2.7 0 0 1 13.5 6c0 3.6-5.5 7-5.5 7Z" stroke="currentColor" stroke-width="1.1" /></svg></span></footer>
    </main>
  </div>
</template>
