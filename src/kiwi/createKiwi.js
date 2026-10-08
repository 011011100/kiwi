import * as THREE from 'three'

const TAU = Math.PI * 2
const clamp = THREE.MathUtils.clamp
const BODY_WIDTH = 0.46
const BODY_HEIGHT = 0.66
const BODY_LENGTH = 0.83
const HEAD_HEIGHT = 0.54
const HEAD_FORWARD = 0.6

function seededRandom(seed = 17) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function surfacePoint(unit, head = false) {
  if (head) return new THREE.Vector3(unit.x * 0.31, unit.y * 0.32, unit.z * 0.345)
  const pear = 1 - unit.y * 0.15
  return new THREE.Vector3(unit.x * BODY_WIDTH * pear, unit.y * BODY_HEIGHT, unit.z * BODY_LENGTH * pear - 0.11)
}

function roundedMesh(material, scale, position, parent) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), material)
  mesh.scale.set(...scale)
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

// Taper a round cross-section along a curved centerline, including the pointed tip.
function taperedCurve(points, radii, material, parent, segments = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
  const vertices = []
  const indices = []
  const sides = 10
  const frames = curve.computeFrenetFrames(segments, false)

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const p = curve.getPointAt(t)
    const ri = t * (radii.length - 1)
    const radius = THREE.MathUtils.lerp(radii[Math.floor(ri)], radii[Math.min(Math.floor(ri) + 1, radii.length - 1)], ri % 1)
    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * TAU
      const v = p.clone()
        .addScaledVector(frames.normals[i], Math.cos(angle) * radius)
        .addScaledVector(frames.binormals[i], Math.sin(angle) * radius)
      vertices.push(v.x, v.y, v.z)
      if (i < segments && j < sides) {
        const a = i * (sides + 1) + j
        const b = a + sides + 1
        indices.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function addFeathers(parent, count, head = false) {
  const random = seededRandom(head ? 109 : 17)
  // Four-sided, tapered filaments catch the light without adding one draw call per feather.
  const geometry = new THREE.ConeGeometry(0.009, 0.095, 4, 1)
  geometry.translate(0, 0.0475, 0)
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93 })
  const fur = new THREE.InstancedMesh(geometry, material, count)
  const dummy = new THREE.Object3D()
  const up = new THREE.Vector3(0, 1, 0)
  const normal = new THREE.Vector3()
  const flow = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const color = new THREE.Color()
  const dark = new THREE.Color('#4e3426')
  const light = new THREE.Color('#a27a50')

  for (let i = 0; i < count; i++) {
    // An even Fibonacci distribution gives a soft coat instead of randomly clumped spikes.
    const y = 1 - ((i + 0.5) / count) * 2
    const radius = Math.sqrt(1 - y * y)
    const theta = i * Math.PI * (3 - Math.sqrt(5))
    const unit = new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius)
    const point = surfacePoint(unit, head)
    normal.set(unit.x / (head ? 0.31 : BODY_WIDTH), unit.y / (head ? 0.32 : BODY_HEIGHT), unit.z / (head ? 0.345 : BODY_LENGTH)).normalize()
    flow.set(unit.x * 0.15, -0.85, -0.42)
    tangent.copy(flow).addScaledVector(normal, -flow.dot(normal)).normalize()
    // Lie almost flat against the skin; only the fine tips break the silhouette.
    tangent.addScaledVector(normal, 0.18 + random() * 0.12).normalize()
    dummy.position.copy(point).addScaledVector(normal, -0.006)
    dummy.quaternion.setFromUnitVectors(up, tangent)
    const length = (head ? 0.44 : 0.8) + random() * (head ? 0.4 : 0.65)
    dummy.scale.set(0.7 + random() * 0.5, length, 0.7 + random() * 0.5)
    dummy.updateMatrix()
    fur.setMatrixAt(i, dummy.matrix)
    color.copy(dark).lerp(light, clamp(0.19 + random() * 0.64 + unit.z * 0.13, 0, 1))
    fur.setColorAt(i, color)
  }

  fur.instanceMatrix.needsUpdate = true
  fur.instanceColor.needsUpdate = true
  fur.castShadow = true
  fur.receiveShadow = true
  parent.add(fur)
}

/**
 * A self-contained, procedural kiwi. Local +Z is forward; feet stand at Y = 0.
 * Approximate resting bounds: X ±0.55, Y 0..1.74, Z -0.99..1.68.
 * speed is a nonnegative normalized walking intensity (values above 1 are clamped).
 * headYaw/headPitch are local radians; peck is the 0..1 progress of a single peck.
 */
export function createKiwi() {
  const root = new THREE.Group()
  root.name = 'kiwi'
  const body = new THREE.Group()
  body.name = 'body'
  body.position.y = 0.85
  root.add(body)

  const coat = new THREE.MeshStandardMaterial({ color: '#785137', roughness: 0.97 })
  const wingCoat = new THREE.MeshStandardMaterial({ color: '#63432e', roughness: 0.98 })
  const billMaterial = new THREE.MeshStandardMaterial({ color: '#e1bf80', roughness: 0.6 })
  const billSeam = new THREE.MeshStandardMaterial({ color: '#ab8252', roughness: 0.86 })
  const footMaterial = new THREE.MeshStandardMaterial({ color: '#927044', roughness: 0.88 })
  const clawMaterial = new THREE.MeshStandardMaterial({ color: '#d6bd88', roughness: 0.7 })
  const eyeMaterial = new THREE.MeshPhysicalMaterial({ color: '#10130f', roughness: 0.12, clearcoat: 1 })
  const eyeRim = new THREE.MeshStandardMaterial({ color: '#463021', roughness: 0.9 })
  const glintMaterial = new THREE.MeshBasicMaterial({ color: '#fff4d8' })

  const bodyGeometry = new THREE.SphereGeometry(1, 40, 32)
  const positions = bodyGeometry.getAttribute('position')
  const unit = new THREE.Vector3()
  for (let i = 0; i < positions.count; i++) {
    unit.fromBufferAttribute(positions, i)
    const p = surfacePoint(unit)
    positions.setXYZ(i, p.x, p.y, p.z)
  }
  bodyGeometry.computeVertexNormals()
  const bodyMesh = new THREE.Mesh(bodyGeometry, coat)
  bodyMesh.castShadow = true
  bodyMesh.receiveShadow = true
  body.add(bodyMesh)
  addFeathers(body, 1550)

  for (const side of [-1, 1]) {
    const wing = roundedMesh(wingCoat, [0.065, 0.19, 0.265], [side * 0.43, 0.015, -0.08], body)
    wing.rotation.x = -0.35
    wing.rotation.z = side * 0.22
  }

  const head = new THREE.Group()
  head.name = 'head'
  head.position.set(0, HEAD_HEIGHT, HEAD_FORWARD)
  head.rotation.order = 'YXZ'
  body.add(head)
  roundedMesh(coat, [0.31, 0.32, 0.345], [0, 0, 0], head)
  addFeathers(head, 430, true)

  // The long, gently drooping bill is the kiwi's defining silhouette.
  taperedCurve([[0, -0.025, 0.285], [0, -0.055, 0.53], [0, -0.115, 0.81], [0, -0.185, 1.07]], [0.075, 0.052, 0.028, 0.003], billMaterial, head)
  taperedCurve([[0, -0.073, 0.325], [0, -0.102, 0.56], [0, -0.147, 0.82], [0, -0.183, 1.055]], [0.01, 0.007, 0.004, 0.001], billSeam, head)
  for (const side of [-1, 1]) {
    // Unlike a cartoon chicken, the eyes are small and embedded in the head.
    roundedMesh(eyeRim, [0.033, 0.067, 0.061], [side * 0.254, 0.074, 0.157], head)
    roundedMesh(eyeMaterial, [0.037, 0.047, 0.046], [side * 0.273, 0.08, 0.168], head)
    roundedMesh(glintMaterial, [0.009, 0.013, 0.01], [side * 0.302, 0.096, 0.18], head)
    // Kiwi nostrils are near the end of the bill.
    roundedMesh(billSeam, [0.007, 0.006, 0.013], [side * 0.012, -0.16, 0.992], head)
  }

  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group()
    leg.name = side < 0 ? 'left-leg' : 'right-leg'
    leg.position.set(side * 0.185, 0.255, -0.015)
    root.add(leg)
    roundedMesh(footMaterial, [0.066, 0.16, 0.06], [0, -0.062, 0], leg)
    const foot = new THREE.Group()
    foot.name = 'foot'
    foot.position.set(0, -0.221, 0.045)
    leg.add(foot)
    roundedMesh(footMaterial, [0.075, 0.035, 0.115], [0, 0, 0.045], foot)
    for (const spread of [-1, 0, 1]) {
      const endX = spread * 0.118
      const endZ = spread === 0 ? 0.29 : 0.22
      taperedCurve([[spread * 0.034, 0, 0.045], [endX * 0.65, -0.008, endZ * 0.65], [endX, -0.013, endZ]], [0.024, 0.021, 0.013], footMaterial, foot, 8)
      taperedCurve([[endX, -0.013, endZ], [endX * 1.08, -0.015, endZ + 0.039]], [0.014, 0.001], clawMaterial, foot, 4)
    }
    return leg
  })

  let previousTime = null
  let walkPhase = 0

  function animate({ time = 0, speed = 0, headYaw = 0, headPitch = 0, peck = 0, reducedMotion = false } = {}) {
    const dt = previousTime === null ? 0 : clamp(time - previousTime, 0, 0.06)
    previousTime = time
    const stride = clamp(speed, 0, 1)
    walkPhase += dt * (7 + stride * 5) * stride
    const motion = reducedMotion ? 0.35 : 1
    const activePeck = peck > 0 && peck < 1
    // A quick downward strike and a softer recovery, both with continuous endpoints.
    const strike = activePeck ? Math.sin(Math.PI * Math.pow(peck, 0.7)) : 0
    const breathing = Math.sin(time * 2.4) * 0.012 * motion
    body.position.y = 0.85 + breathing + Math.abs(Math.sin(walkPhase)) * stride * 0.032 * motion - strike * 0.115
    body.position.z = strike * 0.075
    body.rotation.set(strike * 0.13, 0, Math.sin(walkPhase) * stride * 0.038 * motion)
    body.scale.set(1, 1 + Math.sin(time * 2.4) * 0.006 * motion, 1)
    head.rotation.y = clamp(headYaw, -1.12, 1.12)
    head.rotation.x = clamp(headPitch, -0.3, 0.32) + strike * 1.02
    head.rotation.z = Math.sin(time * 0.85) * 0.018 * (1 - stride) * motion
    head.position.set(0, HEAD_HEIGHT - strike * 0.022, HEAD_FORWARD + strike * 0.065)

    legs.forEach((leg, index) => {
      const phase = walkPhase + index * Math.PI
      leg.rotation.x = Math.sin(phase) * stride * 0.57
      leg.position.y = 0.255 + Math.max(0, Math.cos(phase)) * stride * 0.06
      // Slight toe flex keeps the lift readable without an elaborate skeleton.
      leg.children[1].rotation.x = -leg.rotation.x * 0.4
    })
  }

  animate()
  return { root, body, head, legs, animate }
}
