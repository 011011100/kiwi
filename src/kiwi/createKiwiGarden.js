import * as THREE from 'three'
import { createKiwi } from './createKiwi.js'
import { createInteractables } from './createInteractables.js'
import { dampAngle, clampToGarden, keyboardVector, canPeckTarget } from './movement.js'

const BACKGROUND = '#eeeee4'
const PECK_DURATION = 0.46

export function createKiwiGarden(container, { onState = () => {}, onError = () => {} } = {}) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(BACKGROUND)
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 80)
  camera.position.set(6, 9, 12)
  camera.lookAt(0, 0.3, 0)
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  } catch {
    throw new Error('这个浏览器暂时无法开启 3D 画面。请开启硬件加速，或用较新版本的 Chrome、Edge、Safari 再试一次。')
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.24
  const canvas = renderer.domElement
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', '几维鸟互动庭院。方向键或 WASD 走路，空格啄击，鼠标移动让头部转向。')
  canvas.setAttribute('aria-describedby', 'play-instructions')
  canvas.setAttribute('role', 'application')
  container.appendChild(canvas)

  scene.add(new THREE.HemisphereLight('#fffbe7', '#748267', 2.6))
  const sun = new THREE.DirectionalLight('#fff2d0', 4.1)
  sun.position.set(-3, 9, 5)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.1, far: 25 })
  sun.shadow.normalBias = 0.04
  sun.shadow.bias = -0.0002
  sun.shadow.radius = 4
  scene.add(sun)

  const matte = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
  function mesh(geometry, material, parent = scene) {
    const item = new THREE.Mesh(geometry, material)
    item.castShadow = true
    item.receiveShadow = true
    parent.add(item)
    return item
  }
  const floor = mesh(new THREE.PlaneGeometry(200, 200), matte(BACKGROUND))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.22
  floor.castShadow = false
  const island = mesh(new THREE.CylinderGeometry(5.55, 5.42, 0.24, 96), matte('#a1af83'))
  island.position.y = -0.13
  const meadow = mesh(new THREE.CircleGeometry(5.54, 96), matte('#bbc59b'))
  meadow.rotation.x = -Math.PI / 2
  meadow.position.y = -0.004
  meadow.castShadow = false

  // Seeded decoration stays consistent across resets and uses a few instanced draws.
  let seed = 29
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 4294967296
  }
  const dummy = new THREE.Object3D()
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.025, 0.2, 3), matte('#73885c'), 580)
  for (let i = 0; i < grass.count; i++) {
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(random()) * 5.36
    dummy.position.set(Math.cos(angle) * radius, 0.04, Math.sin(angle) * radius)
    dummy.rotation.set((random() - 0.5) * 0.7, random() * Math.PI, (random() - 0.5) * 0.6)
    dummy.scale.setScalar(0.5 + random() * 0.7)
    dummy.updateMatrix()
    grass.setMatrixAt(i, dummy.matrix)
  }
  grass.receiveShadow = true
  scene.add(grass)

  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), matte('#c6c6b2'), 19)
  for (let i = 0; i < stones.count; i++) {
    const angle = random() * Math.PI * 2
    const radius = 4.4 + random() * 0.7
    dummy.position.set(Math.cos(angle) * radius, 0.06, Math.sin(angle) * radius)
    dummy.rotation.set(random(), random(), random())
    dummy.scale.set(0.1 + random() * 0.2, 0.08 + random() * 0.11, 0.12 + random() * 0.25)
    dummy.updateMatrix()
    stones.setMatrixAt(i, dummy.matrix)
  }
  stones.castShadow = true
  stones.receiveShadow = true
  scene.add(stones)

  const leafMaterial = matte('#6f895c')
  const leafLight = matte('#8b9c6c')
  const stemMaterial = matte('#8a7854')
  const leafGeometry = new THREE.SphereGeometry(1, 8, 6)
  // Fern-like leaves frame the meadow, keeping the middle clear for the bird.
  for (const [x, z, scale] of [[-3.6, -3.2, 1.2], [3.6, -3.4, 0.95], [-4.9, 0.1, 0.8], [4.6, 1.0, 0.6]]) {
    const plant = new THREE.Group()
    plant.position.set(x, 0, z)
    plant.scale.setScalar(scale)
    scene.add(plant)
    for (let j = 0; j < 7; j++) {
      const angle = j * 2.4
      const stem = mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.75, 5), stemMaterial, plant)
      stem.position.set(Math.sin(angle) * 0.16, 0.32, Math.cos(angle) * 0.16)
      stem.rotation.z = Math.sin(angle) * 0.6
      stem.rotation.x = Math.cos(angle) * 0.6
      const leaf = mesh(leafGeometry, j % 2 ? leafMaterial : leafLight, plant)
      leaf.position.set(Math.sin(angle) * 0.37, 0.62 + (j % 3) * 0.08, Math.cos(angle) * 0.37)
      leaf.scale.set(0.16, 0.45, 0.055)
      leaf.rotation.set(0.3, angle, Math.sin(angle) * -0.8)
    }
  }

  const pet = createKiwi()
  pet.root.position.set(-0.6, 0, 0.55)
  pet.root.rotation.y = -0.8
  scene.add(pet.root)

  const targets = []
  const eyeMaterial = matte('#3d3b2b')
  const whiteMaterial = matte('#f4e6c8')
  const stemGeo = new THREE.CylinderGeometry(0.13, 0.19, 0.5, 12)
  const capGeo = new THREE.SphereGeometry(0.44, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  const eyeGeo = new THREE.SphereGeometry(0.029, 8, 6)
  for (const [x, z, color, scale] of [[1.6, 1.8, '#cc7754', 1], [-2.1, -1.2, '#cca25e', 0.85], [2.15, -1.65, '#c27e69', 1.15]]) {
    const root = new THREE.Group()
    root.position.set(x, 0, z)
    root.scale.setScalar(scale)
    scene.add(root)
    const stem = mesh(stemGeo, whiteMaterial, root)
    stem.position.y = 0.26
    const cap = mesh(capGeo, matte(color), root)
    cap.position.y = 0.49
    const underside = mesh(new THREE.CircleGeometry(0.44, 24), whiteMaterial, root)
    underside.rotation.x = Math.PI / 2
    underside.position.y = 0.49
    for (const side of [-1, 1]) {
      const eye = mesh(eyeGeo, eyeMaterial, root)
      eye.position.set(side * 0.064, 0.3, 0.13)
    }
    for (let j = 0; j < 6; j++) {
      const a = j * 2.4
      const spot = mesh(new THREE.SphereGeometry(0.065, 8, 6), whiteMaterial, root)
      const r = j % 2 ? 0.28 : 0.16
      spot.position.set(Math.sin(a) * r, 0.49 + Math.sqrt(0.44 ** 2 - r ** 2), Math.cos(a) * r)
      spot.scale.y = 0.3
    }
    targets.push({ root, x, z, hitAt: -100, scale })
  }

  const interactables = createInteractables(scene)
  const allTargets = [...targets, ...interactables.targets]
  allTargets.forEach((target) => { target.root.userData.interactionTarget = target })

  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#677b50', transparent: true, opacity: 0.52, depthWrite: false })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.2, 40), ringMaterial)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.014
  ring.visible = false
  scene.add(ring)
  const particleMaterial = new THREE.MeshBasicMaterial({ color: '#ffe4a3' })
  const particles = Array.from({ length: 12 }, () => {
    const item = mesh(new THREE.OctahedronGeometry(0.065), particleMaterial)
    item.visible = false
    item.castShadow = false
    return { item, velocity: new THREE.Vector3(), life: 0 }
  })

  const pointer = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const aim = new THREE.Vector3(1.4, 0, 1.9)
  const intersection = new THREE.Vector3()
  const directions = new Set()
  const keyMap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }
  const heldKeys = new Set()
  const touchDirections = new Set()
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reducedMotion = motionQuery.matches
  let mode = window.matchMedia('(pointer: coarse)').matches ? 'keyboard' : 'follow'
  let pointerActive = false
  let hasAim = false
  let speed = 0
  let elapsed = 0
  let headYaw = 0
  let aimedTarget = null
  let peckTime = -1
  let peckHit = false
  let pecks = 0
  let hits = 0
  let disposed = false
  let contextLost = false
  let frame = 0
  let previousTime = 0
  let lastState = ''
  let gardenRadius = 4.1

  function publish(force = false) {
    const state = { mode, pecks, hits, moving: speed > 0.12, pecking: peckTime >= 0, ready: !contextLost }
    const signature = JSON.stringify(state)
    if (force || signature !== lastState) {
      lastState = signature
      onState(state)
    }
  }
  function clearKeys() {
    heldKeys.clear()
    touchDirections.clear()
    directions.clear()
    speed = 0
  }
  function updateDirections() {
    directions.clear()
    heldKeys.forEach((key) => directions.add(keyMap[key]))
    touchDirections.forEach((direction) => directions.add(direction))
  }
  function setMode(next) {
    if (!['follow', 'keyboard'].includes(next) || next === mode) return
    mode = next
    clearKeys()
    pointerActive = false
    ring.visible = false
    publish()
  }
  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects(allTargets.map((target) => target.root), true)[0]
    let object = hit?.object
    while (object && !object.userData.interactionTarget) object = object.parent
    aimedTarget = object?.userData.interactionTarget || null
    if (aimedTarget) intersection.set(aimedTarget.x, 0, aimedTarget.z)
    else if (!raycaster.ray.intersectPlane(groundPlane, intersection)) return
    const point = clampToGarden(intersection.x, intersection.z, gardenRadius)
    aim.set(point.x, 0, point.z)
    pointerActive = true
    hasAim = true
    ring.position.set(point.x, 0.016, point.z)
    ring.visible = mode === 'follow'
  }
  function peck() {
    if (disposed || contextLost || peckTime >= 0) return
    peckTime = 0
    peckHit = false
    pecks++
    speed = 0
    if (hasAim && pet.root.position.distanceTo(aim) > 0.2) {
      pet.root.rotation.y = Math.atan2(aim.x - pet.root.position.x, aim.z - pet.root.position.z)
    }
    publish()
  }
  function hitTarget() {
    const pose = { x: pet.root.position.x, z: pet.root.position.z, yaw: pet.root.rotation.y }
    const target = allTargets
      .filter((item) => canPeckTarget(pose, item, { reach: 1.9, halfAngle: Math.PI / 3 }))
      .sort((a, b) => Math.hypot(a.x - pose.x, a.z - pose.z) - Math.hypot(b.x - pose.x, b.z - pose.z))[0]
    if (!target) return
    if (target.onPeck) target.onPeck(elapsed, pose)
    else target.hitAt = elapsed
    hits++
    if (!reducedMotion) particles.forEach((particle, i) => {
      const angle = i / particles.length * Math.PI * 2
      particle.item.position.set(target.x, 0.85, target.z)
      particle.velocity.set(Math.cos(angle) * 1.3, 1.7 + (i % 3) * 0.3, Math.sin(angle) * 1.3)
      particle.life = 0.6
      particle.item.visible = true
    })
  }
  function onPointerMove(event) {
    if (event.pointerType !== 'touch') updatePointer(event)
  }
  function onPointerDown(event) {
    if (event.button !== 0) return
    canvas.focus({ preventScroll: true })
    updatePointer(event)
    peck()
  }
  function onPointerLeave() {
    pointerActive = false
    ring.visible = false
  }
  function onKeyDown(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (keyMap[event.code]) {
      event.preventDefault()
      setMode('keyboard')
      heldKeys.add(event.code)
      updateDirections()
    } else if (event.code === 'Space') {
      event.preventDefault()
      if (!event.repeat) peck()
    } else if (event.code === 'Escape') {
      clearKeys()
      canvas.blur()
    }
  }
  function onKeyUp(event) {
    heldKeys.delete(event.code)
    updateDirections()
  }
  function setDirection(direction, pressed) {
    if (!['up', 'down', 'left', 'right'].includes(direction)) return
    if (pressed) setMode('keyboard')
    if (pressed) touchDirections.add(direction)
    else touchDirections.delete(direction)
    updateDirections()
  }
  function reset() {
    clearKeys()
    pet.root.position.set(-0.6, 0, 0.55)
    pet.root.rotation.y = -0.8
    hasAim = pointerActive = false
    ring.visible = false
    peckTime = -1
    pecks = hits = 0
    aimedTarget = null
    headYaw = 0
    interactables.reset()
    targets.forEach((target) => { target.hitAt = -100 })
    particles.forEach((p) => { p.life = 0; p.item.visible = false })
    publish(true)
  }
  function resize() {
    const width = container.clientWidth
    const height = container.clientHeight
    if (!width || !height || disposed) return
    const aspect = width / height
    const viewHeight = aspect < 1 ? 11.7 : 8.9
    camera.left = -viewHeight * aspect / 2
    camera.right = viewHeight * aspect / 2
    camera.top = viewHeight / 2
    camera.bottom = -viewHeight / 2
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    gardenRadius = Math.min(4.1, Math.max(2.35, viewHeight * aspect / 2 - 1.35))
    const bounded = clampToGarden(pet.root.position.x, pet.root.position.z, gardenRadius)
    pet.root.position.x = bounded.x
    pet.root.position.z = bounded.z
    const boundedAim = clampToGarden(aim.x, aim.z, gardenRadius)
    aim.set(boundedAim.x, 0, boundedAim.z)
    ring.position.set(aim.x, 0.016, aim.z)
  }
  function animate(timestamp) {
    if (disposed || contextLost || document.hidden) return
    const dt = previousTime ? Math.min((timestamp - previousTime) / 1000, 0.05) : 0
    previousTime = timestamp
    elapsed += dt
    let dx = 0
    let dz = 0
    let targetSpeed = 0
    if (peckTime < 0) {
      if (mode === 'keyboard') {
        const direction = keyboardVector(directions)
        dx = direction.x
        dz = direction.z
        targetSpeed = dx || dz ? 2.65 : 0
      } else if (pointerActive) {
        dx = aim.x - pet.root.position.x
        dz = aim.z - pet.root.position.z
        const distance = Math.hypot(dx, dz)
        const stopDistance = aimedTarget ? 1.18 : 0.22
        if (distance > stopDistance) {
          dx /= distance
          dz /= distance
          targetSpeed = Math.min(2.65, (distance - stopDistance) * 4)
        }
      }
    }
    speed = THREE.MathUtils.damp(speed, targetSpeed, 13, dt)
    if (targetSpeed > 0) {
      const point = clampToGarden(pet.root.position.x + dx * speed * dt, pet.root.position.z + dz * speed * dt, gardenRadius)
      interactables.resolveMovement(point, gardenRadius)
      const travelled = Math.hypot(point.x - pet.root.position.x, point.z - pet.root.position.z)
      pet.root.position.x = point.x
      pet.root.position.z = point.z
      if (travelled < 0.00001) speed = 0
      pet.root.rotation.y = dampAngle(pet.root.rotation.y, Math.atan2(dx, dz), 11, dt)
    }
    if (peckTime >= 0) {
      peckTime += dt
      if (!peckHit && peckTime >= PECK_DURATION * 0.43) {
        peckHit = true
        hitTarget()
      }
      if (peckTime >= PECK_DURATION) peckTime = -1
    }
    const headAngle = hasAim ? Math.atan2(aim.x - pet.root.position.x, aim.z - pet.root.position.z) - pet.root.rotation.y : 0
    const normalizedHead = Math.atan2(Math.sin(headAngle), Math.cos(headAngle))
    headYaw = THREE.MathUtils.damp(headYaw, THREE.MathUtils.clamp(normalizedHead, -1.15, 1.15), 12, dt)
    pet.animate({
      time: elapsed,
      speed: Math.min(speed / 2.65, 1),
      headYaw,
      headPitch: hasAim ? 0.06 : -0.03,
      peck: peckTime >= 0 ? peckTime / PECK_DURATION : 0,
      reducedMotion
    })
    interactables.update(dt, elapsed, pet.root.position, reducedMotion)
    targets.forEach((target) => {
      const age = elapsed - target.hitAt
      const bounce = age < 0.75 ? Math.sin(Math.min(age / 0.75, 1) * Math.PI) : 0
      target.root.position.y = reducedMotion ? 0 : bounce * 0.65
      target.root.rotation.z = reducedMotion ? 0 : Math.sin(age * 24) * bounce * 0.24
      target.root.scale.setScalar(target.scale * (1 + bounce * (reducedMotion ? 0.06 : 0.08)))
    })
    particles.forEach((particle) => {
      if (particle.life <= 0) return
      particle.life -= dt
      particle.item.visible = particle.life > 0
      particle.velocity.y -= dt * 5
      particle.item.position.addScaledVector(particle.velocity, dt)
      particle.item.scale.setScalar(Math.max(0, particle.life / 0.6))
      particle.item.rotation.y += dt * 5
    })
    publish()
    renderer.render(scene, camera)
    frame = requestAnimationFrame(animate)
  }
  function resume() {
    cancelAnimationFrame(frame)
    previousTime = 0
    if (!document.hidden && !disposed && !contextLost) frame = requestAnimationFrame(animate)
  }
  function onVisibility() {
    clearKeys()
    pointerActive = false
    ring.visible = false
    resume()
  }
  function onBlur() {
    clearKeys()
    pointerActive = false
    ring.visible = false
  }
  function onMotionChange(event) { reducedMotion = event.matches }
  function onContextLost(event) {
    event.preventDefault()
    contextLost = true
    clearKeys()
    cancelAnimationFrame(frame)
    publish()
    onError('3D 画面连接中断了，请刷新页面重新打开小庭院。')
  }

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('blur', clearKeys)
  canvas.addEventListener('webglcontextlost', onContextLost)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)
  motionQuery.addEventListener('change', onMotionChange)
  resize()
  publish(true)
  resume()

  return {
    setMode, setDirection, peck, reset,
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('blur', clearKeys)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      motionQuery.removeEventListener('change', onMotionChange)
      const geometries = new Set()
      const materials = new Set()
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry)
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => materials.add(m))
        if (object.isInstancedMesh) object.dispose()
      })
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      sun.shadow.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    }
  }
}
