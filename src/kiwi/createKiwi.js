import * as THREE from 'three'
import { createKiwiCoat } from './createKiwiCoat.js'
import { createKiwiAnimator } from './animateKiwi.js'

const TAU = Math.PI * 2
const BODY_PIVOT = 1.1
const BODY_LEAN = 0.78
const HEAD_BALANCE = -0.60
const HEAD_PIVOT = 1.0
const HEAD_CENTER = new THREE.Vector3(0, 0.3, 0.04)
const HEAD_RADII = new THREE.Vector3(0.385, 0.395, 0.355)

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

function ellipsoid(radii, position, surface, parent, uvScale = [1, 1]) {
  const geometry = new THREE.SphereGeometry(1, 32, 24)
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1])
  const item = addMesh(geometry, surface, parent)
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

function bodyGeometry() {
  // A continuous spline avoids the ridges between the old feather-covered sections.
  const profile = new THREE.CatmullRomCurve3(BODY_PROFILE.map(([y, width, depth]) => new THREE.Vector3(width, y, depth)))
  const positions = []
  const uvs = []
  const indices = []
  const rows = 72
  const sides = 64
  for (let row = 0; row <= rows; row++) {
    const point = profile.getPoint(row / rows)
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU
      positions.push(Math.cos(angle) * Math.max(0, point.x) * 1.08, point.y - BODY_PIVOT, Math.sin(angle) * Math.max(0, point.z) * 1.08 - 0.035)
      // An integer horizontal repeat joins cleanly along the back seam.
      uvs.push(side / sides * 3, (point.y - 0.59) / 0.9)
      if (row < rows && side < sides) {
        const a = row * (sides + 1) + side
        const b = a + sides + 1
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  // The duplicated UV seam shares one smooth surface normal.
  const normals = geometry.getAttribute('normal')
  const normal = new THREE.Vector3()
  const other = new THREE.Vector3()
  for (let row = 0; row <= rows; row++) {
    const first = row * (sides + 1)
    const last = first + sides
    normal.fromBufferAttribute(normals, first).add(other.fromBufferAttribute(normals, last)).normalize()
    normals.setXYZ(first, normal.x, normal.y, normal.z)
    normals.setXYZ(last, normal.x, normal.y, normal.z)
  }
  return geometry
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

/** A smooth, textured kiwi with a playful forward-leaning waddle. Local +Z is forward and the feet rest at Y = 0.
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
  const { coat, faceCoat } = createKiwiCoat()
  const billMaterial = material('#eda32e', { roughness: 0.58 })
  const billSeam = material('#b87928')
  const footMaterial = material('#e29a31', { roughness: 0.72 })
  const clawMaterial = material('#c0802d', { roughness: 0.72 })
  const eyeMaterial = new THREE.MeshPhysicalMaterial({ color: '#130e0b', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 })
  const eyeRim = material('#7b4d2b')
  const glint = new THREE.MeshBasicMaterial({ color: '#fff5df' })
  addMesh(bodyGeometry(), coat, body)
  // Overlapping round volumes share the same soft coat texture.
  const head = new THREE.Group()
  head.name = 'head'
  head.position.set(0, HEAD_PIVOT, 0.005)
  head.rotation.order = 'YXZ'
  body.add(head)
  ellipsoid(HEAD_RADII.toArray(), HEAD_CENTER.toArray(), faceCoat, head, [3, 1.3])
  for (const side of [-1, 1]) {
    const rim = ellipsoid([0.046, 0.049, 0.018], [side * 0.222, 0.365, 0.328], eyeRim, head)
    rim.rotation.y = side * 0.35
    const eye = ellipsoid([0.038, 0.041, 0.029], [side * 0.226, 0.367, 0.342], eyeMaterial, head)
    eye.rotation.y = side * 0.3
    ellipsoid([0.006, 0.007, 0.004], [side * 0.219, 0.381, 0.366], glint, head)
  }

  taperedCurve([[0, 0.247, 0.31], [0, 0.211, 0.53], [0, 0.137, 0.84], [0, 0.014, 1.14]], [0.081, 0.061, 0.035, 0.004], billMaterial, head, 30, 12)
  taperedCurve([[0, 0.194, 0.352], [0, 0.163, 0.565], [0, 0.106, 0.84], [0, 0.013, 1.122]], [0.008, 0.006, 0.004, 0.001], billSeam, head)
  for (const side of [-1, 1]) {
    const nostril = ellipsoid([0.006, 0.008, 0.023], [side * 0.022, 0.081, 0.975], billSeam, head)
    nostril.rotation.x = -0.36
  }

  const feet = []
  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group()
    leg.name = side < 0 ? 'left-leg' : 'right-leg'
    leg.position.set(side * 0.215, 0.83, -0.013)
    root.add(leg)
    const thighCenter = new THREE.Vector3(0, -0.19, -0.015)
    const thighRadii = new THREE.Vector3(0.171, 0.335, 0.205)
    ellipsoid(thighRadii.toArray(), thighCenter.toArray(), coat, leg, [1, 1.3])
    ellipsoid([0.045, 0.143, 0.041], [0, -0.544, -0.015], footMaterial, leg)
    // A rounded articulated ankle bridges the shin and rotating foot even
    // during the large forward step; both ends overlap the existing volumes.
    const ankleShaft = addMesh(new THREE.CylinderGeometry(0.039, 0.037, 1, 16), footMaterial, leg)
    const ankleUpper = ellipsoid([0.04, 0.04, 0.04], [0, -0.60, -0.015], footMaterial, leg)
    const ankleLower = ellipsoid([0.039, 0.039, 0.039], [0, -0.61, -0.015], footMaterial, leg)
    leg.userData.ankleRig = { shaft: ankleShaft, upper: ankleUpper, lower: ankleLower }
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

  const animate = createKiwiAnimator({
    body, head, legs, feet,
    bodyPivot: BODY_PIVOT, bodyLean: BODY_LEAN,
    headPivot: HEAD_PIVOT, headBalance: HEAD_BALANCE,
  })
  animate()
  return { root, body, head, legs, animate }
}
