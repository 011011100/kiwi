import * as THREE from 'three'

const TAU = Math.PI * 2
const clamp = THREE.MathUtils.clamp
const BODY_PIVOT = 1.1
const BODY_LEAN = 0.78
const HEAD_BALANCE = -0.60
const HEAD_PIVOT = 1.0
const HEAD_CENTER = new THREE.Vector3(0, 0.3, 0.04)
const HEAD_RADII = new THREE.Vector3(0.365, 0.375, 0.335)

function randomGenerator(seed = 37) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options })
}

function addMesh(geometry, surface, parent) {
  const item = new THREE.Mesh(geometry, surface)
  item.castShadow = true
  item.receiveShadow = true
  parent.add(item)
  return item
}

function ellipsoid(radii, position, surface, parent) {
  const item = addMesh(new THREE.SphereGeometry(1, 28, 22), surface, parent)
  item.scale.set(...radii)
  item.position.set(...position)
  return item
}

// A single smooth contour runs from the hips through the sloping back and neck.
const BODY_PROFILE = [
  [0.59, 0, 0], [0.73, 0.24, 0.225], [1.02, 0.385, 0.31],
  [1.32, 0.38, 0.31], [1.59, 0.30, 0.25], [1.82, 0.255, 0.225],
  [2.03, 0.24, 0.22], [2.2, 0.245, 0.225], [2.31, 0, 0],
]

function bodyProfile(y) {
  let index = 0
  while (index < BODY_PROFILE.length - 2 && y > BODY_PROFILE[index + 1][0]) index++
  const a = BODY_PROFILE[index]
  const b = BODY_PROFILE[index + 1]
  const t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1)
  const smooth = t * t * (3 - 2 * t)
  return [THREE.MathUtils.lerp(a[1], b[1], smooth), THREE.MathUtils.lerp(a[2], b[2], smooth)]
}

function bodyPoint(y, angle) {
  const [width, depth] = bodyProfile(y)
  return new THREE.Vector3(Math.cos(angle) * width, y - BODY_PIVOT, Math.sin(angle) * depth - 0.035)
}

function bodyGeometry() {
  const positions = []
  const indices = []
  const rows = 64
  const sides = 48
  for (let row = 0; row <= rows; row++) {
    const y = 0.59 + row / rows * 1.72
    for (let side = 0; side <= sides; side++) {
      const p = bodyPoint(y, side / sides * TAU)
      positions.push(p.x, p.y, p.z)
      if (row < rows && side < sides) {
        const a = row * (sides + 1) + side
        const b = a + sides + 1
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// A feather is a wide, gently curled ribbon with a rounded tip and raised center fold.
// It lies along the skin, so the silhouette reads as a fluffy coat rather than spikes.
function featherGeometry() {
  const levels = [0, 0.035, 0.085, 0.139, 0.185]
  const widths = [0.004, 0.023, 0.025, 0.015, 0.002]
  const bends = [0, 0.002, 0.008, 0.022, 0.036]
  const positions = []
  const indices = []
  for (let row = 0; row < levels.length; row++) {
    for (let side = -1; side <= 1; side++) {
      positions.push(widths[row] * side, levels[row], bends[row] + (side === 0 ? 0.007 * Math.sin(row / 4 * Math.PI) : 0))
    }
    if (row < levels.length - 1) {
      const a = row * 3
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function furCoat(parent, geometry, furMaterial, count, sampler, seed) {
  const random = randomGenerator(seed)
  const fur = new THREE.InstancedMesh(geometry, furMaterial, count)
  const transform = new THREE.Object3D()
  const frame = new THREE.Matrix4()
  const tangent = new THREE.Vector3()
  const across = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const color = new THREE.Color()
  const dark = new THREE.Color('#804022')
  const gold = new THREE.Color('#bf773e')
  for (let i = 0; i < count; i++) {
    const sample = sampler(i, count, random)
    normal.copy(sample.normal).normalize()
    tangent.copy(sample.flow).addScaledVector(normal, -sample.flow.dot(normal)).normalize()
    if (tangent.lengthSq() < 0.01) tangent.set(0, -1, 0)
    across.crossVectors(tangent, normal).normalize()
    normal.crossVectors(across, tangent).normalize()
    frame.makeBasis(across, tangent, normal)
    transform.quaternion.setFromRotationMatrix(frame)
    transform.position.copy(sample.point).addScaledVector(sample.normal, -0.007)
    const length = sample.scale * (0.78 + random() * 0.43)
    transform.scale.set(sample.width * (0.83 + random() * 0.32), length, length)
    transform.updateMatrix()
    fur.setMatrixAt(i, transform.matrix)
    color.copy(dark).lerp(gold, clamp(sample.light + random() * 0.32, 0, 1))
    fur.setColorAt(i, color)
  }
  fur.instanceMatrix.needsUpdate = true
  fur.instanceColor.needsUpdate = true
  fur.computeBoundingSphere()
  // Smooth underlying volumes cast the shadow; ribbons keep their soft, lit facets.
  fur.castShadow = false
  fur.receiveShadow = true
  parent.add(fur)
  return fur
}

function taperedCurve(points, radii, surface, parent, segments = 24, sides = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
  const frames = curve.computeFrenetFrames(segments, false)
  const positions = []
  const indices = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const p = curve.getPointAt(t)
    const ri = t * (radii.length - 1)
    const radius = THREE.MathUtils.lerp(radii[Math.floor(ri)], radii[Math.min(Math.floor(ri) + 1, radii.length - 1)], ri % 1)
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU
      const v = p.clone().addScaledVector(frames.normals[i], Math.cos(angle) * radius).addScaledVector(frames.binormals[i], Math.sin(angle) * radius)
      positions.push(v.x, v.y, v.z)
      if (i < segments && side < sides) {
        const a = i * (sides + 1) + side
        const b = a + sides + 1
        indices.push(a, a + 1, b, b, a + 1, b + 1)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return addMesh(geometry, surface, parent)
}

/** Forward-leaning, fluffy kiwi. Local +Z is forward and the feet rest at Y = 0.
 * animate receives time in seconds, normalized speed, local head angles in radians,
 * and peck progress from 0 to 1. The caller owns all scene resource disposal.
 */
export function createKiwi() {
  const root = new THREE.Group()
  root.name = 'kiwi'
  const body = new THREE.Group()
  body.name = 'body'
  body.position.y = BODY_PIVOT
  root.add(body)
  const coat = material('#9d5c2f')
  const faceCoat = material('#ab6935')
  const furMaterial = material('#ffffff', { side: THREE.DoubleSide })
  const feathers = featherGeometry()
  const billMaterial = material('#eda32e', { roughness: 0.58 })
  const billSeam = material('#b87928')
  const footMaterial = material('#e29a31', { roughness: 0.72 })
  const clawMaterial = material('#c0802d', { roughness: 0.72 })
  const eyeMaterial = new THREE.MeshPhysicalMaterial({ color: '#130e0b', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 })
  const eyeRim = material('#7b4d2b')
  const glint = new THREE.MeshBasicMaterial({ color: '#fff5df' })
  addMesh(bodyGeometry(), coat, body)
  furCoat(body, feathers, furMaterial, 1500, (i, count, random) => {
    const y = 0.66 + (i + 0.5) / count * 1.57
    const angle = i * 2.399963 + (random() - 0.5) * 0.22
    const point = bodyPoint(y, angle)
    const next = bodyPoint(y + 0.004, angle)
    const previous = bodyPoint(y - 0.004, angle)
    const [width, depth] = bodyProfile(y)
    const normal = new THREE.Vector3(Math.cos(angle) / Math.max(width, 0.1), 0, Math.sin(angle) / Math.max(depth, 0.1))
    const slope = next.sub(previous).multiplyScalar(125)
    normal.y = -normal.x * slope.x - normal.z * slope.z
    normal.normalize()
    return { point, normal, flow: new THREE.Vector3(Math.cos(angle) * 0.06, -1, -0.08), scale: y > 1.85 ? 0.77 : 1.0, width: 0.92, light: 0.24 + Math.max(0, Math.sin(angle)) * 0.19 }
  }, 13)

  // The neck continues behind the head's lower edge; both carry the same layered coat.
  const head = new THREE.Group()
  head.name = 'head'
  head.position.set(0, HEAD_PIVOT, 0.005)
  head.rotation.order = 'YXZ'
  body.add(head)
  ellipsoid(HEAD_RADII.toArray(), HEAD_CENTER.toArray(), faceCoat, head)
  furCoat(head, feathers, furMaterial, 800, (i, count, random) => {
    const y = 1 - (i + 0.5) / count * 2
    const radius = Math.sqrt(1 - y * y)
    const angle = i * 2.399963 + (random() - 0.5) * 0.12
    const unit = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
    const point = unit.clone().multiply(HEAD_RADII).add(HEAD_CENTER)
    const normal = unit.clone().divide(HEAD_RADII).normalize()
    const face = unit.z > 0.5
    const eyeDistance = Math.min(...[-1, 1].map((side) => Math.hypot(point.x - side * 0.217, point.y - 0.367, point.z - 0.307)))
    const eyeOpening = eyeDistance < 0.074
    return { point, normal, flow: new THREE.Vector3(unit.x * 0.38, unit.y > 0.3 ? 0.35 : -0.92, -0.8), scale: eyeOpening ? 0 : (face ? 0.38 : 0.76), width: eyeOpening ? 0 : (face ? 0.55 : 0.86), light: face ? 0.59 : 0.34 }
  }, 31)

  for (const side of [-1, 1]) {
    const rim = ellipsoid([0.046, 0.049, 0.018], [side * 0.214, 0.365, 0.305], eyeRim, head)
    rim.rotation.y = side * 0.35
    const eye = ellipsoid([0.038, 0.041, 0.029], [side * 0.217, 0.367, 0.314], eyeMaterial, head)
    eye.rotation.y = side * 0.3
    ellipsoid([0.006, 0.007, 0.004], [side * 0.210, 0.381, 0.338], glint, head)
  }

  taperedCurve([[0, 0.247, 0.31], [0, 0.211, 0.53], [0, 0.137, 0.84], [0, 0.014, 1.14]], [0.081, 0.061, 0.035, 0.004], billMaterial, head, 30, 12)
  taperedCurve([[0, 0.194, 0.352], [0, 0.163, 0.565], [0, 0.106, 0.84], [0, 0.013, 1.122]], [0.008, 0.006, 0.004, 0.001], billSeam, head)
  for (const side of [-1, 1]) {
    const nostril = ellipsoid([0.006, 0.008, 0.023], [side * 0.022, 0.081, 0.975], billSeam, head)
    nostril.rotation.x = -0.36
  }

  const feet = []
  const legs = [-1, 1].map((side, legIndex) => {
    const leg = new THREE.Group()
    leg.name = side < 0 ? 'left-leg' : 'right-leg'
    leg.position.set(side * 0.215, 0.83, -0.013)
    root.add(leg)
    const thighCenter = new THREE.Vector3(0, -0.19, -0.015)
    const thighRadii = new THREE.Vector3(0.142, 0.315, 0.175)
    ellipsoid(thighRadii.toArray(), thighCenter.toArray(), coat, leg)
    furCoat(leg, feathers, furMaterial, 260, (i, count) => {
      const y = 1 - (i + 0.5) / count * 2
      const radius = Math.sqrt(1 - y * y)
      const angle = i * 2.399963
      const unit = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      return { point: unit.clone().multiply(thighRadii).add(thighCenter), normal: unit.clone().divide(thighRadii).normalize(), flow: new THREE.Vector3(side * 0.08, -1, -0.03), scale: 0.77, width: 0.83, light: 0.28 + Math.max(0, unit.z) * 0.14 }
    }, 71 + legIndex)
    ellipsoid([0.045, 0.143, 0.041], [0, -0.544, -0.015], footMaterial, leg)
    const foot = new THREE.Group()
    foot.name = 'three-toed-foot'
    foot.position.set(0, -0.803, 0.005)
    leg.add(foot)
    feet.push(foot)
    taperedCurve([[0, 0.205, -0.02], [0, 0.089, -0.012], [0, 0.024, 0.034]], [0.035, 0.036, 0.056], footMaterial, foot, 12)
    ellipsoid([0.073, 0.037, 0.087], [0, 0.015, 0.055], footMaterial, foot)
    for (const spread of [-1, 0, 1]) {
      const endX = spread * 0.153
      const endZ = spread === 0 ? 0.34 : 0.259
      taperedCurve([[spread * 0.023, 0.014, 0.045], [endX * 0.57, 0.009, endZ * 0.62], [endX, -0.006, endZ]], [0.033, 0.028, 0.019], footMaterial, foot, 12)
      taperedCurve([[endX, -0.006, endZ], [endX * 1.06, -0.009, endZ + 0.035], [endX * 1.09, -0.024, endZ + 0.053]], [0.019, 0.013, 0.004], clawMaterial, foot, 8)
      // Soft knuckles separate the rounded toes without relying on triangular feet.
      ellipsoid([0.028, 0.013, 0.035], [endX * 0.61, 0.026, endZ * 0.65], footMaterial, foot)
    }
    return leg
  })

  let previousTime = null
  let walkPhase = 0
  function animate({ time = 0, speed = 0, headYaw = 0, headPitch = 0, peck = 0, reducedMotion = false } = {}) {
    const dt = previousTime === null ? 0 : clamp(time - previousTime, 0, 0.06)
    previousTime = time
    const stride = clamp(speed, 0, 1)
    walkPhase += dt * (7 + stride * 4) * stride
    const motion = reducedMotion ? 0.35 : 1
    const strike = peck > 0 && peck < 1 ? Math.sin(Math.PI * Math.pow(peck, 0.7)) : 0
    const breath = Math.sin(time * 2.25) * 0.011 * motion
    body.position.set(0, BODY_PIVOT + breath + Math.abs(Math.sin(walkPhase)) * stride * 0.032 * motion - strike * 0.14, 0.06 + strike * 0.025)
    body.rotation.set(BODY_LEAN + stride * 0.035 + strike * 0.4, 0, Math.sin(walkPhase) * stride * 0.028 * motion)
    body.scale.set(1 + breath * 0.14, 1 + breath * 0.21, 1 + breath * 0.22)
    head.position.set(0, HEAD_PIVOT - strike * 0.035, 0.005 + strike * 0.015)
    head.rotation.y = clamp(headYaw, -1.05, 1.05) * (1 - strike * 0.2)
    head.rotation.x = HEAD_BALANCE + clamp(headPitch, -0.19, 0.24) + strike * 0.96
    head.rotation.z = Math.sin(time * 0.9) * 0.018 * (1 - stride) * motion
    legs.forEach((leg, index) => {
      const phase = walkPhase + index * Math.PI
      leg.rotation.x = Math.sin(phase) * stride * 0.34
      leg.position.y = 0.83 + Math.max(0, Math.cos(phase)) * stride * 0.055
      feet[index].rotation.x = -leg.rotation.x * 0.55
    })
  }
  animate()
  return { root, body, head, legs, animate }
}
