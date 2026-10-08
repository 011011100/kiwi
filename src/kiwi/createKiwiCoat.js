import * as THREE from 'three'

const SIZE = 512
const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor

function randomGenerator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function lattice(x, y, columns, rows) {
  let hash = Math.imul(modulo(x, columns) + 1, 374761393) ^ Math.imul(modulo(y, rows) + 1, 668265263)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295
}

// Each octave repeats exactly across UV borders, including the small nap strokes.
function noise(u, v, columns, rows = columns) {
  const x = u * columns
  const y = v * rows
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const top = THREE.MathUtils.lerp(lattice(ix, iy, columns, rows), lattice(ix + 1, iy, columns, rows), sx)
  const bottom = THREE.MathUtils.lerp(lattice(ix, iy + 1, columns, rows), lattice(ix + 1, iy + 1, columns, rows), sx)
  return THREE.MathUtils.lerp(top, bottom, sy) - 0.5
}

function softDab(field, x, y, radius, intensity) {
  const reach = radius + 0.5
  for (let py = Math.floor(y - reach); py <= Math.ceil(y + reach); py++) {
    for (let px = Math.floor(x - reach); px <= Math.ceil(x + reach); px++) {
      const distance = Math.hypot(px - x, py - y)
      if (distance >= reach) continue
      const coverage = 1 - distance / reach
      field[modulo(py, SIZE) * SIZE + modulo(px, SIZE)] += intensity * coverage * coverage
    }
  }
}

function texture(data, name, colorSpace) {
  const result = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
  result.name = name
  result.colorSpace = colorSpace
  result.wrapS = result.wrapT = THREE.RepeatWrapping
  result.magFilter = THREE.LinearFilter
  result.minFilter = THREE.LinearMipmapLinearFilter
  result.generateMipmaps = true
  result.anisotropy = 4
  result.needsUpdate = true
  return result
}

/** A close, soft nap for smooth surfaces; one UV tile represents roughly 0.9 m. */
export function createKiwiCoat() {
  const nap = new Float32Array(SIZE * SIZE)
  const random = randomGenerator(1607)

  // Paired soft light and shade make the brushed nap legible after mipmapping.
  // The strands remain short and rounded; their silhouette comes from the mesh.
  for (let stroke = 0; stroke < 2800; stroke++) {
    const x = random() * SIZE
    const y = random() * SIZE
    const length = 16 + random() * 22
    const angle = (random() - 0.5) * 0.7
    const bend = (random() - 0.5) * 5
    const radius = 0.8 + random() * 0.65
    const strength = 0.65 + random() * 0.55
    const steps = Math.ceil(length / 0.85)
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      const curve = Math.sin(t * Math.PI) * bend
      const px = x + Math.sin(angle) * length * t + curve
      const py = y + Math.cos(angle) * length * t
      const fade = 0.4 + 0.6 * Math.sin(t * Math.PI)
      softDab(nap, px, py, radius, -strength * fade)
      softDab(nap, px - radius * 1.5, py, radius * 0.8, strength * 0.7 * fade)
    }
  }

  const diffuse = new Uint8Array(SIZE * SIZE * 4)
  const relief = new Uint8Array(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE
      const v = y / SIZE
      const pixel = y * SIZE + x
      const broad = noise(u, v, 10) * 3.5 + noise(u, v, 23) * 2.5
      const fine = noise(u, v, 71, 53) * 3 + noise(u, v, 163, 151) * 2
      const strand = THREE.MathUtils.clamp(nap[pixel], -3, 3)
      const light = broad + fine + strand * 9.5
      const offset = pixel * 4
      diffuse[offset] = THREE.MathUtils.clamp(145 + light, 0, 255)
      diffuse[offset + 1] = THREE.MathUtils.clamp(83 + light * 0.77, 0, 255)
      diffuse[offset + 2] = THREE.MathUtils.clamp(44 + light * 0.5, 0, 255)
      diffuse[offset + 3] = 255
      const height = Math.round(128 + fine * 1.1 + strand * 6.5)
      relief[offset] = relief[offset + 1] = relief[offset + 2] = height
      relief[offset + 3] = 255
    }
  }

  const map = texture(diffuse, 'kiwi-soft-coat-color', THREE.SRGBColorSpace)
  const bumpMap = texture(relief, 'kiwi-soft-coat-relief', THREE.NoColorSpace)
  const surface = {
    map,
    bumpMap,
    bumpScale: 0.018,
    roughness: 1,
    metalness: 0,
  }
  return {
    coat: new THREE.MeshStandardMaterial({ ...surface, color: '#fff0df' }),
    faceCoat: new THREE.MeshStandardMaterial({ ...surface, color: '#fff8ed' }),
  }
}
