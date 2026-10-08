import * as THREE from 'three'

const TAU = Math.PI * 2
const { clamp, lerp } = THREE.MathUtils

// Keep the toe contour in the foot's own coordinates. Grounding then works
// independently of the scene's translation and heading for the whole bird.
function footCorners(foot) {
  const bounds = new THREE.Box3()
  const relative = new THREE.Matrix4()
  const box = new THREE.Box3()
  foot.traverse((part) => {
    if (!part.geometry) return
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox()
    relative.identity()
    for (let node = part; node && node !== foot; node = node.parent) {
      node.updateMatrix()
      relative.premultiply(node.matrix)
    }
    box.copy(part.geometry.boundingBox).applyMatrix4(relative)
    bounds.union(box)
  })
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-0.18, -0.03, -0.06), new THREE.Vector3(0.18, 0.24, 0.40))
  const corners = []
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z))
    }
  }
  return corners
}

/** A bouncy, alternating waddle. The caller retains ownership of root movement. */
export function createKiwiAnimator({ body, head, legs, feet, bodyPivot = 1.1, bodyLean = 0.78, headPivot = 1, headBalance = -0.60 }) {
  const rests = legs.map((leg) => leg.position.clone())
  const corners = feet.map(footCorners)
  const footToRoot = new THREE.Matrix4()
  const corner = new THREE.Vector3()
  const ankleDirection = new THREE.Vector3()
  const ankleAxis = new THREE.Vector3(0, 1, 0)
  const ankleRigs = legs.map((leg) => leg.userData.ankleRig)
  let previousTime = null
  let walkPhase = 0
  let walking = 0

  return function animate({ time = 0, speed = 0, headYaw = 0, headPitch = 0, peck = 0, reducedMotion = false } = {}) {
    const dt = previousTime === null ? 0 : clamp(time - previousTime, 0, 0.06)
    previousTime = time
    const pecking = peck > 0 && peck < 1
    const strike = pecking ? Math.sin(Math.PI * Math.pow(peck, 0.7)) : 0
    const target = clamp(speed, 0, 1) * (1 - strike)
    walking = lerp(walking, target, 1 - Math.exp(-dt * (target > walking ? 11 : 17)))
    if (walking < 0.0001) walking = 0
    walkPhase = (walkPhase + dt * (6.5 + walking * 4.5) * walking) % TAU
    const motion = reducedMotion ? 0.32 : 1
    const gait = walking * motion * (1 - strike)
    const sway = Math.sin(walkPhase)
    const bounce = (1 - Math.cos(walkPhase * 2)) * 0.5
    const breath = Math.sin(time * 2.25) * 0.009 * motion
    const bodyRoll = -sway * gait * 0.11

    body.position.set(sway * gait * 0.058, bodyPivot + breath + bounce * gait * 0.10 - strike * 0.14, 0.06 + strike * 0.025)
    body.rotation.set(bodyLean + gait * 0.04 + Math.sin(walkPhase * 2) * gait * 0.055 + strike * 0.4, 0, bodyRoll)
    const squash = Math.cos(walkPhase * 2) * gait * 0.025
    body.scale.set(1 + squash + breath * 0.14, 1 - squash * 0.6 + breath * 0.21, 1 + squash * 0.5 + breath * 0.22)

    // The head remains attached to the neck, with a small counter-sway as the
    // body waddles. Aim and the existing peck arc still drive the bill.
    head.position.set(0, headPivot - strike * 0.035, 0.005 + strike * 0.015)
    head.rotation.y = clamp(headYaw, -1.05, 1.05) * (1 - strike * 0.2)
    head.rotation.x = headBalance + clamp(headPitch, -0.19, 0.24) - Math.sin(walkPhase * 2) * gait * 0.035 + strike * 0.96
    head.rotation.z = -bodyRoll * 0.6 + Math.sin(time * 0.9) * 0.018 * (1 - walking) * motion

    legs.forEach((leg, index) => {
      const phase = walkPhase + index * Math.PI
      const swing = Math.max(0, Math.sin(phase))
      const lift = Math.pow(swing, 1.45) * gait * 0.19
      const side = index === 0 ? -1 : 1
      leg.position.copy(rests[index])
      leg.position.x += side * swing * gait * 0.027
      leg.rotation.set(Math.cos(phase) * gait * 0.63, 0, side * swing * gait * 0.055)
      const foot = feet[index]
      // Counter-rotate the foot so a planted foot stays level. Only the lifted
      // foot tips its toes up, then levels out again before the next contact.
      foot.rotation.set(-leg.rotation.x - swing * gait * 0.12, 0, -leg.rotation.z)
      leg.updateMatrix()
      foot.updateMatrix()
      const ankle = ankleRigs[index]
      if (ankle) {
        // The shin anchor stays in leg space while the lower anchor follows
        // the foot. A shaft and round end caps keep the joint continuous.
        ankle.lower.position.set(0, 0.19, -0.02).applyMatrix4(foot.matrix)
        ankleDirection.subVectors(ankle.lower.position, ankle.upper.position)
        const length = ankleDirection.length()
        ankle.shaft.position.copy(ankle.upper.position).addScaledVector(ankleDirection, 0.5)
        ankle.shaft.scale.y = length
        if (length > 0.00001) ankle.shaft.quaternion.setFromUnitVectors(ankleAxis, ankleDirection.multiplyScalar(1 / length))
      }
      footToRoot.multiplyMatrices(leg.matrix, foot.matrix)
      let lowest = Infinity
      for (const point of corners[index]) lowest = Math.min(lowest, corner.copy(point).applyMatrix4(footToRoot).y)
      leg.position.y += 0.004 + lift - lowest
    })
  }
}
