const TAU = Math.PI * 2

/** Wrap a heading to [-PI, PI), so turns always take the shortest route. */
export function normalizeAngle(angle) {
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI
}

/** Frame-rate-independent angular smoothing. Headings face +Z at zero. */
export function dampAngle(current, target, lambda, dt) {
  const turn = normalizeAngle(target - current)
  return normalizeAngle(current + turn * (1 - Math.exp(-lambda * dt)))
}

/** Keep a world-space position inside the circular, walkable garden. */
export function clampToGarden(x, z, radius = 4) {
  const distance = Math.hypot(x, z)
  if (distance <= radius || distance === 0) return { x, z }
  const scale = radius / distance
  return { x: x * scale, z: z * scale }
}

/** Convert screen-relative arrow keys into one constant-speed world vector. */
export function keyboardVector(
  directions,
  cameraRight = { x: 0.8944, z: -0.4472 },
  cameraForward = { x: -0.4472, z: -0.8944 },
) {
  const horizontal = Number(directions.has('right')) - Number(directions.has('left'))
  const vertical = Number(directions.has('up')) - Number(directions.has('down'))
  const x = cameraRight.x * horizontal + cameraForward.x * vertical
  const z = cameraRight.z * horizontal + cameraForward.z * vertical
  const length = Math.hypot(x, z)
  return length > 0 ? { x: x / length, z: z / length } : { x: 0, z: 0 }
}

/** A peck lands only within reach and inside the bird's forward-facing cone. */
export function canPeckTarget(
  { x, z, yaw },
  target,
  { reach = 1.9, halfAngle = Math.PI / 3 } = {},
) {
  const dx = target.x - x
  const dz = target.z - z
  const distance = Math.hypot(dx, dz)
  if (distance === 0) return true
  if (distance > reach) return false
  const angle = normalizeAngle(Math.atan2(dx, dz) - yaw)
  return Math.abs(angle) <= halfAngle + Number.EPSILON * 8
}

/** Respect a clicked target when reachable; free pecks hit the nearest object in front. */
export function selectPeckTarget(pose, targets, aimedTarget = null) {
  const reachable = targets.filter((target) => canPeckTarget(pose, target))
  if (aimedTarget && reachable.includes(aimedTarget)) return aimedTarget
  return reachable.sort((a, b) =>
    Math.hypot(a.x - pose.x, a.z - pose.z) - Math.hypot(b.x - pose.x, b.z - pose.z),
  )[0]
}
