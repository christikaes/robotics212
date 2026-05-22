import * as THREE from 'three'

/**
 * Returns a unit vector perpendicular to worldAxis, preferring the +X direction.
 * Uses Gram-Schmidt: project +X onto the plane normal to worldAxis.
 * Falls back to +Z when worldAxis is nearly parallel to +X.
 */
export function perpToAxis(worldAxis: THREE.Vector3): THREE.Vector3 {
  const xAxis = new THREE.Vector3(1, 0, 0)
  const zAxis = new THREE.Vector3(0, 0, 1)
  const ref = Math.abs(worldAxis.dot(xAxis)) < 0.9 ? xAxis : zAxis
  return ref.clone().sub(worldAxis.clone().multiplyScalar(worldAxis.dot(ref))).normalize()
}
