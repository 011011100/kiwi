import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const TAU = Math.PI * 2

function makeRandom(seed = 607) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function bladeGeometry() {
  // Broad, round-ended blades with a gentle bend instead of needle-shaped grass.
  const outline = new THREE.Shape()
  outline.moveTo(-0.028, 0)
  outline.bezierCurveTo(-0.12, 0.12, -0.135, 0.29, -0.032, 0.44)
  outline.bezierCurveTo(-0.014, 0.467, 0.008, 0.47, 0.028, 0.446)
  outline.bezierCurveTo(0.12, 0.29, 0.103, 0.11, 0.027, 0)
  outline.closePath()
  const geometry = new THREE.ShapeGeometry(outline, 4)
  const positions = geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i)
    positions.setZ(i, y * y * 0.7)
  }
  geometry.computeVertexNormals()
  return geometry
}

function makeClump() {
  const blade = bladeGeometry()
  const left = blade.clone().scale(0.91, 0.79, 1).rotateZ(0.48).rotateY(-0.55).translate(-0.033, 0, 0)
  const right = blade.clone().scale(0.95, 0.87, 1).rotateZ(-0.53).rotateY(0.6).translate(0.033, 0, 0)
  const middle = blade.clone().rotateY(0.18)
  const geometry = mergeGeometries([left, right, middle])
  blade.dispose()
  left.dispose()
  right.dispose()
  middle.dispose()
  return geometry
}

function softPatch(random) {
  const points = []
  for (let i = 0; i < 10; i++) {
    const angle = i / 10 * TAU
    const radius = 0.63 + random() * 0.37
    points.push(new THREE.Vector3(Math.cos(angle) * radius * 1.8, Math.sin(angle) * radius, 0))
  }
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.65)
  const shape = new THREE.Shape(curve.getPoints(64).map((p) => new THREE.Vector2(p.x, p.y)))
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2)
}

/** A continuous cartoon meadow; the owning scene disposes its geometry and materials. */
export function createMeadow(scene) {
  const random = makeRandom()
  const group = new THREE.Group()
  group.name = 'continuous-cartoon-meadow'
  scene.add(group)
  const matte = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, ...options })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), matte('#a8cf7c'))
  ground.name = 'endless-grass-ground'
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.016
  ground.receiveShadow = true
  group.add(ground)

  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  // Uneven, stretched green shapes cross the frame without an island or a repeated grid.
  for (let variant = 0; variant < 4; variant++) {
    const patches = new THREE.InstancedMesh(softPatch(random), matte(variant % 2 ? '#b4d88c' : '#9dc875', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 24)
    patches.name = `meadow-color-patches-${variant}`
    for (let i = 0; i < patches.count; i++) {
      dummy.position.set((random() - 0.5) * 57, -0.014 + variant * 0.0002, (random() - 0.5) * 57)
      dummy.rotation.set(0, random() * TAU, 0)
      dummy.scale.set(0.8 + random() * 1.3, 1, 0.7 + random() * 1.3)
      dummy.updateMatrix()
      patches.setMatrixAt(i, dummy.matrix)
    }
    patches.receiveShadow = true
    group.add(patches)
  }

  const clearings = [[-0.6, 0.55, 1.05], [1.6, 1.8, 0.7], [-2.1, -1.2, 0.68], [2.15, -1.65, 0.75], [-2.2, 1.8, 0.82], [1, -2.7, 0.85]]
  function clearAt(x, z, margin = 0) {
    return clearings.every(([cx, cz, radius]) => Math.hypot(x - cx, z - cz) > radius + margin)
  }
  function scatterPoint(range, margin = 0) {
    let x, z
    do {
      x = (random() - 0.5) * range
      z = (random() - 0.5) * range
    } while (!clearAt(x, z, margin))
    return [x, z]
  }

  const greens = ['#649943', '#74a94d', '#82b356', '#679d48', '#8dbd65']
  const grassGeometry = makeClump()
  const grassMaterial = matte('#ffffff', { side: THREE.DoubleSide })
  const grassTiles = Array.from({ length: 16 }, () => [])
  for (let i = 0; i < 1700; i++) {
    const [x, z] = scatterPoint(56)
    const scale = 0.53 + random() * 0.52
    dummy.position.set(x, -0.006, z)
    dummy.rotation.set(0, random() * TAU, 0)
    dummy.scale.set(scale, scale * (0.85 + random() * 0.2), scale)
    dummy.updateMatrix()
    const tileX = Math.min(3, Math.floor((x + 28) / 14))
    const tileZ = Math.min(3, Math.floor((z + 28) / 14))
    grassTiles[tileZ * 4 + tileX].push({ matrix: dummy.matrix.clone(), color: greens[i % greens.length] })
  }
  // Small spatial batches let the camera discard distant grass while retaining every tuft.
  grassTiles.forEach((instances, tile) => {
    if (!instances.length) return
    const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, instances.length)
    grass.name = `round-three-blade-grass-tile-${tile % 4}-${Math.floor(tile / 4)}`
    instances.forEach((instance, index) => {
      grass.setMatrixAt(index, instance.matrix)
      grass.setColorAt(index, color.set(instance.color))
    })
    grass.computeBoundingSphere()
    grass.castShadow = false
    grass.receiveShadow = true
    group.add(grass)
  })

  // A few little daisies are deliberately easy to spot in the starting camera view.
  const flowerLocations = [[-3.6, 2.8], [3.7, 2.9], [-0.7, -4.1], [4.3, -0.2], [-4.1, -1.8], [0.2, 3.9]]
  for (let i = 0; i < 34; i++) flowerLocations.push(scatterPoint(47, 0.2))
  const petalGeometry = new THREE.SphereGeometry(1, 8, 6)
  const petalParts = []
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * TAU
    const petal = petalGeometry.clone().scale(0.062, 0.022, 0.105).rotateY(angle).translate(Math.sin(angle) * 0.078, 0, Math.cos(angle) * 0.078)
    petalParts.push(petal)
  }
  const flowerGeometry = mergeGeometries(petalParts)
  petalParts.forEach((part) => part.dispose())
  petalGeometry.dispose()
  const petals = new THREE.InstancedMesh(flowerGeometry, matte('#fff1bf'), flowerLocations.length)
  const centers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.053, 10, 6), matte('#e7b84d'), flowerLocations.length)
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.016, 1, 5), matte('#699646'), flowerLocations.length)
  flowerLocations.forEach(([x, z], index) => {
    const height = 0.17 + random() * 0.13
    const size = 0.76 + random() * 0.35
    dummy.position.set(x, height, z)
    dummy.rotation.set(0.1, random() * TAU, 0.14)
    dummy.scale.setScalar(size)
    dummy.updateMatrix()
    petals.setMatrixAt(index, dummy.matrix)
    dummy.position.y += 0.017
    dummy.scale.set(size, size * 0.5, size)
    dummy.updateMatrix()
    centers.setMatrixAt(index, dummy.matrix)
    dummy.position.set(x, height * 0.5, z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, height, 1)
    dummy.updateMatrix()
    stems.setMatrixAt(index, dummy.matrix)
  })
  for (const item of [petals, centers, stems]) {
    item.castShadow = true
    item.receiveShadow = true
    group.add(item)
  }

  const rocks = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), matte('#c6d4a6'), 22)
  rocks.name = 'small-soft-meadow-stones'
  for (let i = 0; i < rocks.count; i++) {
    const [x, z] = scatterPoint(40, 0.25)
    const size = 0.1 + random() * 0.11
    dummy.position.set(x, size * 0.24 - 0.01, z)
    dummy.rotation.set(0, random() * TAU, 0)
    dummy.scale.set(size * 1.2, size * 0.5, size * 0.9)
    dummy.updateMatrix()
    rocks.setMatrixAt(i, dummy.matrix)
  }
  rocks.castShadow = true
  rocks.receiveShadow = true
  group.add(rocks)
}
