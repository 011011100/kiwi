import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const BIRD_RADIUS = 0.46
const FIELD_RADIUS = 4.1

function limitPoint(point, radius) {
  const distance = Math.hypot(point.x, point.z)
  if (distance > radius && distance > 0) {
    point.x *= radius / distance
    point.z *= radius / distance
  }
  return point
}

function mesh(geometry, material, parent) {
  const item = new THREE.Mesh(geometry, material)
  item.castShadow = true
  item.receiveShadow = true
  parent.add(item)
  return item
}

function grassGeometry() {
  const positions = []
  const colors = []
  const indices = []
  const base = new THREE.Color('#597541')
  const tip = new THREE.Color('#a0b96f')
  const color = new THREE.Color()
  const point = new THREE.Vector3()
  const levels = [0, 0.24, 0.53, 0.79, 1]
  const widths = [0.023, 0.098, 0.09, 0.055, 0]

  for (let leaf = 0; leaf < 11; leaf++) {
    const angle = leaf * 2.399963
    const height = 0.7 + ((leaf * 7) % 11) * 0.037
    const lean = 0.24 + (leaf % 3) * 0.09
    const offset = positions.length / 3
    for (let level = 0; level < levels.length; level++) {
      const t = levels[level]
      for (let side = -1; side <= 1; side++) {
        // A raised center fold makes each broad leaf readable in directional light.
        point.set(widths[level] * side, t * height, t * t * lean + (side === 0 ? 0.027 * Math.sin(t * Math.PI) : 0))
        point.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
        point.x += Math.sin(angle) * 0.075
        point.z += Math.cos(angle) * 0.075
        positions.push(point.x, point.y, point.z)
        color.copy(base).lerp(tip, 0.16 + t * 0.6 + (leaf % 3) * 0.08 + (side === 0 ? 0.09 : 0))
        colors.push(color.r, color.g, color.b)
      }
      if (level < levels.length - 1) {
        const a = offset + level * 3
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Movable wooden blocks and bendable grass. radius in resolveMovement is the garden boundary. */
export function createInteractables(scene) {
  const targets = []
  const blocks = []
  const grasses = []
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#514638', roughness: 0.84 })
  const eyeGeometry = new THREE.SphereGeometry(0.032, 10, 8)
  const grainMaterial = new THREE.LineBasicMaterial({ color: '#94724d', transparent: true, opacity: 0.32 })

  for (const [index, config] of [
    { x: -2.2, z: 1.8, color: '#dea17d', size: [0.76, 0.7, 0.76], yaw: -0.16 },
    { x: 1, z: -2.7, color: '#ddc37d', size: [0.82, 0.64, 0.76], yaw: 0.22 },
  ].entries()) {
    const root = new THREE.Group()
    root.name = `pushable-wood-block-${index + 1}`
    root.position.set(config.x, 0, config.z)
    scene.add(root)
    const visual = new THREE.Group()
    visual.rotation.y = config.yaw
    root.add(visual)
    const [width, height, depth] = config.size
    const block = mesh(new RoundedBoxGeometry(width, height, depth, 3, 0.085), new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.88 }), visual)
    block.position.y = height / 2
    for (const side of [-1, 1]) {
      const eye = mesh(eyeGeometry, eyeMaterial, visual)
      eye.position.set(side * 0.12, height * 0.55, depth / 2 + 0.002)
      eye.scale.set(0.83, 1.17, 0.48)
    }
    const smile = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.035, height * 0.38 + 0.008, depth / 2 + 0.005),
      new THREE.Vector3(0, height * 0.38 - 0.002, depth / 2 + 0.005),
      new THREE.Vector3(0.035, height * 0.38 + 0.008, depth / 2 + 0.005),
    ]), grainMaterial)
    visual.add(smile)
    // Subtle growth rings give the pastel blocks a wooden toy finish.
    for (const radius of [0.067, 0.126, 0.185]) {
      const points = Array.from({ length: 33 }, (_, i) => {
        const angle = i / 32 * Math.PI * 2
        return new THREE.Vector3(0.035 + Math.cos(angle) * radius * 1.35, height + 0.002, Math.sin(angle) * radius * 0.76)
      })
      visual.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), grainMaterial))
    }
    const state = {
      root, visual, config, radius: Math.hypot(width, depth) / 2,
      velocity: new THREE.Vector2(), jump: 0, jumpVelocity: 0, hitAt: -100,
    }
    const target = {
      x: config.x, z: config.z, root,
      onPeck(time, pose) {
        state.hitAt = time
        state.velocity.set(Math.sin(pose.yaw), Math.cos(pose.yaw)).multiplyScalar(3.4)
        state.jumpVelocity = 2.0
      },
    }
    state.target = target
    blocks.push(state)
    targets.push(target)
  }

  const blades = grassGeometry()
  const grassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, side: THREE.DoubleSide })
  for (const [index, [x, z]] of [[2.8, 0.3], [-0.8, -2.5]].entries()) {
    const root = new THREE.Group()
    root.name = `touchable-grass-${index + 1}`
    root.position.set(x, 0, z)
    scene.add(root)
    const visual = new THREE.Group()
    root.add(visual)
    mesh(blades, grassMaterial, visual)
    const state = { root, visual, x, z, hitAt: -100, direction: new THREE.Vector2(), phase: index * 2.2 }
    const target = {
      x, z, root,
      onPeck(time, pose) {
        state.hitAt = time
        state.direction.set(Math.sin(pose.yaw), Math.cos(pose.yaw))
      },
    }
    grasses.push(state)
    targets.push(target)
  }

  function syncTarget(block) {
    block.target.x = block.root.position.x
    block.target.z = block.root.position.z
  }

  function keepBlockInside(block, radius = FIELD_RADIUS) {
    const position = block.root.position
    const limit = Math.max(0.2, radius - block.radius)
    if (Math.hypot(position.x, position.z) > limit) {
      limitPoint(position, limit)
      const nx = position.x / limit
      const nz = position.z / limit
      const outward = block.velocity.x * nx + block.velocity.y * nz
      if (outward > 0) {
        block.velocity.x -= outward * nx
        block.velocity.y -= outward * nz
      }
    }
    syncTarget(block)
  }

  function update(dt, time, birdPosition, reducedMotion = false) {
    const step = THREE.MathUtils.clamp(dt, 0, 0.06)
    const motion = reducedMotion ? 0.25 : 1
    for (const block of blocks) {
      block.root.position.x += block.velocity.x * step
      block.root.position.z += block.velocity.y * step
      block.velocity.multiplyScalar(Math.exp(-6 * step))
      if (block.velocity.lengthSq() < 0.0001) block.velocity.set(0, 0)
      keepBlockInside(block)
      block.jumpVelocity -= 12 * step
      block.jump = Math.max(0, block.jump + block.jumpVelocity * step)
      if (block.jump === 0) block.jumpVelocity = Math.max(0, block.jumpVelocity)
      block.root.position.y = block.jump * motion
      const age = Math.max(0, time - block.hitAt)
      const wobble = Math.sin(age * 22) * Math.exp(-age * 7) * 0.11 * motion
      block.visual.rotation.x = block.velocity.y * 0.025 * motion + wobble
      block.visual.rotation.z = -block.velocity.x * 0.025 * motion - wobble * 0.65
      block.visual.position.y = Math.abs(wobble) * 0.18
    }
    for (const grass of grasses) {
      const dx = grass.x - birdPosition.x
      const dz = grass.z - birdPosition.z
      const distance = Math.hypot(dx, dz)
      const proximity = THREE.MathUtils.clamp(1 - distance / 1.2, 0, 1)
      const age = Math.max(0, time - grass.hitAt)
      const hitBend = Math.exp(-age * 4.5) * (0.68 + Math.sin(age * 20) * 0.27)
      const wind = Math.sin(time * 2.3 + grass.phase) * 0.055 * motion
      const awayX = distance > 0.001 ? dx / distance : 0
      const awayZ = distance > 0.001 ? dz / distance : 1
      const bendX = (awayZ * proximity * 0.64 + grass.direction.y * hitBend) * motion + wind
      const bendZ = -(awayX * proximity * 0.64 + grass.direction.x * hitBend) * motion + wind * 0.4
      const smoothing = 1 - Math.exp(-11 * step)
      grass.visual.rotation.x = THREE.MathUtils.lerp(grass.visual.rotation.x, bendX, smoothing)
      grass.visual.rotation.z = THREE.MathUtils.lerp(grass.visual.rotation.z, bendZ, smoothing)
    }
  }

  function resolveMovement(position, radius = FIELD_RADIUS) {
    limitPoint(position, radius)
    // Two passes settle the uncommon case of the bird touching both toys at once.
    for (let pass = 0; pass < 2; pass++) {
      for (const block of blocks) {
        let dx = block.root.position.x - position.x
        let dz = block.root.position.z - position.z
        let distance = Math.hypot(dx, dz)
        const separation = BIRD_RADIUS + block.radius * 0.85
        if (distance >= separation) continue
        if (distance < 0.0001) {
          dx = 0
          dz = 1
          distance = 1
        }
        const nx = dx / distance
        const nz = dz / distance
        const oldX = block.root.position.x
        const oldZ = block.root.position.z
        block.root.position.x = position.x + nx * separation
        block.root.position.z = position.z + nz * separation
        keepBlockInside(block, radius)
        const pushedX = block.root.position.x - oldX
        const pushedZ = block.root.position.z - oldZ
        block.velocity.x += pushedX * 5
        block.velocity.y += pushedZ * 5
        if (block.velocity.length() > 1.5) block.velocity.setLength(1.5)
        dx = position.x - block.root.position.x
        dz = position.z - block.root.position.z
        distance = Math.hypot(dx, dz)
        if (distance < separation && distance > 0.0001) {
          position.x = block.root.position.x + dx / distance * separation
          position.z = block.root.position.z + dz / distance * separation
          limitPoint(position, radius)
        }
      }
    }
    return position
  }

  function reset() {
    for (const block of blocks) {
      block.root.position.set(block.config.x, 0, block.config.z)
      block.visual.rotation.set(0, block.config.yaw, 0)
      block.visual.position.y = 0
      block.velocity.set(0, 0)
      block.jump = 0
      block.jumpVelocity = 0
      block.hitAt = -100
      syncTarget(block)
    }
    for (const grass of grasses) {
      grass.visual.rotation.set(0, 0, 0)
      grass.hitAt = -100
      grass.direction.set(0, 0)
    }
  }

  return { targets, update, reset, resolveMovement }
}
