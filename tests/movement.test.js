import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canPeckTarget,
  selectPeckTarget,
  clampToGarden,
  dampAngle,
  keyboardVector,
  normalizeAngle,
} from '../src/kiwi/movement.js'

const close = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`)
}

test('headings wrap correctly in both directions', () => {
  close(normalizeAngle(3 * Math.PI), -Math.PI)
  close(normalizeAngle(-3 * Math.PI), -Math.PI)
  close(normalizeAngle(2 * Math.PI + 0.4), 0.4)
  close(normalizeAngle(-2 * Math.PI - 0.4), -0.4)
})

test('damping crosses the PI seam by the shortest path', () => {
  const current = Math.PI - 0.1
  const target = -Math.PI + 0.1
  const next = dampAngle(current, target, Math.log(2), 1)
  close(Math.abs(next), Math.PI)
  close(normalizeAngle(next - current), 0.1)
  close(normalizeAngle(dampAngle(target, current, Math.log(2), 1) - target), -0.1)
})

test('angular damping is independent of frame subdivision', () => {
  const oneFrame = dampAngle(0.2, 1.5, 9, 0.1)
  const twoFrames = dampAngle(dampAngle(0.2, 1.5, 9, 0.05), 1.5, 9, 0.05)
  close(oneFrame, twoFrames)
  close(dampAngle(0.2, 1.5, 9, 0), 0.2)
})

test('empty and opposite arrow keys cancel without movement', () => {
  assert.deepEqual(keyboardVector(new Set()), { x: 0, z: 0 })
  assert.deepEqual(keyboardVector(new Set(['left', 'right'])), { x: 0, z: 0 })
  assert.deepEqual(keyboardVector(new Set(['up', 'down'])), { x: 0, z: 0 })
  assert.deepEqual(keyboardVector(new Set(['up', 'down', 'left', 'right'])), { x: 0, z: 0 })
})

test('screen diagonal and cardinal movement have the same speed', () => {
  for (const keys of [['up'], ['down'], ['left'], ['right'], ['up', 'right'], ['down', 'left']]) {
    const vector = keyboardVector(new Set(keys))
    close(Math.hypot(vector.x, vector.z), 1)
  }
  const up = keyboardVector(new Set(['up']))
  assert.ok(up.x < 0 && up.z < 0)
  const right = keyboardVector(new Set(['right']))
  assert.ok(right.x > 0 && right.z < 0)
  assert.deepEqual(
    keyboardVector(new Set(['up', 'left', 'right'])),
    up,
  )
})

test('movement follows a supplied camera basis', () => {
  assert.deepEqual(
    keyboardVector(new Set(['up']), { x: 1, z: 0 }, { x: 0, z: -1 }),
    { x: 0, z: -1 },
  )
})

test('the garden keeps inside positions and clamps outside positions to its circle', () => {
  assert.deepEqual(clampToGarden(0, 0), { x: 0, z: 0 })
  assert.deepEqual(clampToGarden(1, 2), { x: 1, z: 2 })
  assert.deepEqual(clampToGarden(4, 0), { x: 4, z: 0 })
  const edge = clampToGarden(3, 4)
  close(Math.hypot(edge.x, edge.z), 4)
  close(edge.x / edge.z, 3 / 4)
  const custom = clampToGarden(-6, -8, 2)
  close(Math.hypot(custom.x, custom.z), 2)
  assert.ok(custom.x < 0 && custom.z < 0)
})

test('pecks hit in front but miss behind, outside the cone, and out of reach', () => {
  const bird = { x: 0, z: 0, yaw: 0 }
  assert.equal(canPeckTarget(bird, { x: 0, z: 1 }), true)
  assert.equal(canPeckTarget(bird, { x: 0, z: -1 }), false)
  assert.equal(canPeckTarget(bird, { x: 1, z: 0 }), false)
  assert.equal(canPeckTarget(bird, { x: 0, z: 1.9 }), true)
  assert.equal(canPeckTarget(bird, { x: 0, z: 1.9001 }), false)
  assert.equal(canPeckTarget(bird, { x: 0, z: 0 }), true)
})

test('peck angle boundaries and rotated birds are handled correctly', () => {
  const bird = { x: 2, z: 3, yaw: Math.PI / 2 }
  assert.equal(canPeckTarget(bird, { x: 3, z: 3 }), true)
  assert.equal(canPeckTarget(bird, { x: 1, z: 3 }), false)
  const centered = { x: 0, z: 0, yaw: 0 }
  const halfAngle = Math.PI / 3
  assert.equal(canPeckTarget(centered, { x: Math.sin(halfAngle), z: Math.cos(halfAngle) }), true)
  assert.equal(canPeckTarget(centered, { x: Math.sin(halfAngle + 0.001), z: Math.cos(halfAngle + 0.001) }), false)
  assert.equal(canPeckTarget(
    { x: 0, z: 0, yaw: Math.PI - 0.1 },
    { x: Math.sin(-Math.PI + 0.1), z: Math.cos(-Math.PI + 0.1) },
    { reach: 1.1, halfAngle: 0.3 },
  ), true)
})

test('clicking a reachable block takes priority over a closer mushroom', () => {
  const block = { x: 1, z: -2.7 }
  const mushroom = { x: 2.15, z: -1.65 }
  const pose = { x: 1.6, z: -1, yaw: Math.atan2(-0.6, -1.7) }
  assert.equal(selectPeckTarget(pose, [mushroom, block], block), block)
  assert.equal(selectPeckTarget(pose, [mushroom, block]), mushroom)
  assert.equal(selectPeckTarget(pose, [{ x: 10, z: 10 }]), undefined)
  assert.equal(selectPeckTarget(pose, [mushroom, { x: 10, z: 10 }], block), mushroom)
})
