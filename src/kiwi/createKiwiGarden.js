import * as THREE from 'three'
import { createKiwi } from './createKiwi.js'
import { createInteractables } from './createInteractables.js'
import { createMeadow } from './createMeadow.js'
import { dampAngle, keyboardVector, selectPeckTarget } from './movement.js'

const BACKGROUND = '#a8cf7c'
const PECK_DURATION = 0.46

export function createKiwiGarden(container, { onState = () => {}, onError = () => {} } = {}) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(BACKGROUND)
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 80)
  camera.position.set(6, 9, 12)
  const cameraTarget = new THREE.Vector3(0, 0.3, 0)
  const cameraDirection = camera.position.clone().sub(cameraTarget)
  const baseCameraDistance = cameraDirection.length()
  cameraDirection.normalize()
  camera.lookAt(cameraTarget)
  const boundaryPoint = new THREE.Vector3()
  const boundaryPointer = new THREE.Vector2()
  const boundaryRaycaster = new THREE.Raycaster()
  const boundaryGround = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const boundaryIntersection = new THREE.Vector3()

  // Constrain ground positions to the actual viewport, with room for the whole model.
  function clampPosition(position, { radius = 2.1, height = 3.0 } = {}) {
    const halfWidth = (camera.right - camera.left) / 2
    const halfHeight = (camera.top - camera.bottom) / 2
    const basis = camera.matrixWorld.elements
    const groundUp = Math.hypot(basis[4], basis[6])
    const horizontalMargin = Math.min(0.9, (radius + 0.12) / halfWidth)
    const bottomMargin = Math.min(0.9, (radius * groundUp + 0.15) / halfHeight)
    const topMargin = Math.min(0.9, (height * Math.abs(basis[5]) + radius * groundUp + 0.15) / halfHeight)
    boundaryPoint.set(position.x, 0, position.z).project(camera)
    const x = THREE.MathUtils.clamp(boundaryPoint.x, -1 + horizontalMargin, 1 - horizontalMargin)
    const y = THREE.MathUtils.clamp(boundaryPoint.y, -1 + bottomMargin, 1 - topMargin)
    if (Math.abs(x - boundaryPoint.x) < 1e-9 && Math.abs(y - boundaryPoint.y) < 1e-9) return position
    boundaryPointer.set(x, y)
    boundaryRaycaster.setFromCamera(boundaryPointer, camera)
    if (boundaryRaycaster.ray.intersectPlane(boundaryGround, boundaryIntersection)) {
      position.x = boundaryIntersection.x
      position.z = boundaryIntersection.z
    }
    return position
  }
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  } catch {
    throw new Error('这个浏览器暂时无法开启 3D 画面。请开启硬件加速，或用较新版本的 Chrome、Edge、Safari 再试一次。')
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  const canvas = renderer.domElement
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', '几维鸟互动庭院。移动鼠标引导走路；按方向键或 WASD 走路时，鼠标控制转头；点击或空格啄击。触屏拖动走路，轻点啄击。')
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
  createMeadow(scene)

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

  const interactables = createInteractables(scene, { clampPosition })
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
  let touchGesture = null

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
    const point = clampPosition(intersection)
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
    const target = selectPeckTarget(pose, allTargets, aimedTarget)
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
  function finishTouchGesture() {
    const gesture = touchGesture
    touchGesture = null
    if (gesture && canvas.hasPointerCapture(gesture.id)) canvas.releasePointerCapture(gesture.id)
    pointerActive = false
    ring.visible = false
    speed = 0
  }
  function onPointerMove(event) {
    if (event.pointerType === 'touch') {
      if (!touchGesture || event.pointerId !== touchGesture.id) return
      event.preventDefault()
      const distance = Math.hypot(event.clientX - touchGesture.x, event.clientY - touchGesture.y)
      if (!touchGesture.dragging && distance < 8) return
      touchGesture.dragging = true
      setMode('follow')
      updatePointer(event)
      return
    }
    if (touchGesture) return
    if (!directions.size) setMode('follow')
    updatePointer(event)
  }
  function onPointerDown(event) {
    if (event.button !== 0 || event.isPrimary === false) return
    canvas.focus({ preventScroll: true })
    if (event.pointerType === 'touch') {
      if (touchGesture) return
      event.preventDefault()
      clearKeys()
      touchGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, startedAt: performance.now(), dragging: false }
      canvas.setPointerCapture(event.pointerId)
      updatePointer(event)
      // A touch becomes movement only after the drag threshold, or a peck on release.
      pointerActive = false
      ring.visible = false
      speed = 0
      publish()
      return
    }
    updatePointer(event)
    peck()
  }
  function onPointerUp(event) {
    if (!touchGesture || event.pointerId !== touchGesture.id) return
    event.preventDefault()
    const distance = Math.hypot(event.clientX - touchGesture.x, event.clientY - touchGesture.y)
    const isTap = !touchGesture.dragging && distance < 8 && performance.now() - touchGesture.startedAt <= 350
    if (isTap) updatePointer(event)
    finishTouchGesture()
    if (isTap) peck()
    publish()
  }
  function onPointerCancel(event) {
    if (!touchGesture || event.pointerId !== touchGesture.id) return
    finishTouchGesture()
    publish()
  }
  function onPointerLeave(event) {
    if (event.pointerType === 'touch' && touchGesture) return
    pointerActive = false
    ring.visible = false
  }
  function onKeyDown(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (keyMap[event.code]) {
      event.preventDefault()
      if (touchGesture) finishTouchGesture()
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
    finishTouchGesture()
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
    const viewHeight = Math.max(8.9, 11.5 / aspect)
    // A tall orthographic viewport needs more camera distance so its bottom ground
    // rays start above the meadow and the whole bird stays beyond the near plane.
    const cameraUpY = Math.hypot(cameraDirection.x, cameraDirection.z)
    const distance = Math.max(baseCameraDistance, (viewHeight / 2 * cameraUpY + 3) / cameraDirection.y)
    camera.position.copy(cameraTarget).addScaledVector(cameraDirection, distance)
    camera.lookAt(cameraTarget)
    camera.far = Math.max(80, distance * 2 + 20)
    camera.left = -viewHeight * aspect / 2
    camera.right = viewHeight * aspect / 2
    camera.top = viewHeight / 2
    camera.bottom = -viewHeight / 2
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    renderer.setSize(width, height, false)
    clampPosition(pet.root.position)
    interactables.constrainToView()
    clampPosition(aim)
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
      const point = clampPosition({ x: pet.root.position.x + dx * speed * dt, z: pet.root.position.z + dz * speed * dt })
      interactables.resolveMovement(point)
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
    onBlur()
    resume()
  }
  function onBlur() {
    clearKeys()
    finishTouchGesture()
    publish()
  }
  function onMotionChange(event) { reducedMotion = event.matches }
  function onContextLost(event) {
    event.preventDefault()
    contextLost = true
    clearKeys()
    finishTouchGesture()
    cancelAnimationFrame(frame)
    publish()
    onError('3D 画面连接中断了，请刷新页面重新打开小庭院。')
  }

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)
  canvas.addEventListener('lostpointercapture', onPointerCancel)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('blur', onBlur)
  canvas.addEventListener('webglcontextlost', onContextLost)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)
  motionQuery.addEventListener('change', onMotionChange)
  resize()
  canvas.focus({ preventScroll: true })
  publish(true)
  resume()

  return {
    setMode, setDirection, peck, reset,
    dispose() {
      if (disposed) return
      disposed = true
      finishTouchGesture()
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('lostpointercapture', onPointerCancel)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('blur', onBlur)
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
