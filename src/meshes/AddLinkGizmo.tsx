/**
 * AddLinkGizmo — a "+" button that appears in 3D space when a joint is selected.
 *
 * Clicking it creates a new end-effector connected to the joint via a link.
 * The gizmo is positioned in the joint's natural outgoing direction:
 *   revolute  → along incoming link direction (projected ⊥ worldAxis); rotates by angle
 *   prismatic → along existing outgoing edge, or +Y
 *   spherical → +Y
 */

import { useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useScene } from '../scene/SceneContext'
import { perpToAxis } from '../scene/mathUtils'
import type { SceneNode, Vec3 } from '../scene/types'

const LINK_LENGTH = 2.0

export function AddLinkGizmo({ node }: { node: SceneNode }) {
  const { addJointToNode, nodes, edges, frames } = useScene()

  const hasOutgoing = edges.some((e) => e.fromId === node.id)

  const frame = frames.get(node.id)
  const base = new THREE.Vector3(...(frame?.worldPosition ?? node.position))

  const targetPos = useMemo<Vec3>(() => {
    if (node.kind === 'revolute') {
      // World axis = local axis rotated by parent frame orientation.
      const localAxis = new THREE.Vector3(...(node.axis ?? [0, 0, 1])).normalize()
      const worldAxis = frame
        ? localAxis.clone().applyQuaternion(frame.parentWorldQuaternion)
        : localAxis.clone()

      // Reference direction = incoming link direction projected perpendicular to worldAxis.
      // This ensures the arm is straight (angle=0 → child along incoming direction).
      // node.position is the local offset in parent frame = incoming link direction.
      const localIn = new THREE.Vector3(...node.position).normalize()
      const worldIn = frame
        ? localIn.clone().applyQuaternion(frame.parentWorldQuaternion)
        : localIn.clone()
      // Project out the axis component to get the perpendicular component.
      const axisDot = worldIn.dot(worldAxis)
      const worldInPerp = worldIn.clone().sub(worldAxis.clone().multiplyScalar(axisDot))
      // Fall back to perpToAxis if incoming direction is (nearly) parallel to axis.
      const refDir = worldInPerp.lengthSq() > 1e-6
        ? worldInPerp.normalize()
        : perpToAxis(worldAxis)

      const angleRad = ((node.angle ?? 0) * Math.PI) / 180
      const rotQuat = new THREE.Quaternion().setFromAxisAngle(worldAxis, angleRad)
      const dir = refDir.clone().applyQuaternion(rotQuat)
      const p = base.clone().add(dir.multiplyScalar(LINK_LENGTH))
      return [p.x, p.y, p.z]
    }

    if (node.kind === 'prismatic') {
      const outEdge = edges.find((e) => e.fromId === node.id)
      if (outEdge) {
        const child = nodes.find((n) => n.id === outEdge.toId)
        if (child) {
          const childWorldPos = frames.get(child.id)?.worldPosition ?? child.position
          const dir = new THREE.Vector3(...childWorldPos).sub(base).normalize()
          const p = base.clone().add(dir.multiplyScalar(LINK_LENGTH))
          return [p.x, p.y, p.z]
        }
      }
      const p = base.clone().add(new THREE.Vector3(0, LINK_LENGTH, 0))
      return [p.x, p.y, p.z]
    }

    // spherical / default
    const p = base.clone().add(new THREE.Vector3(0, LINK_LENGTH, 0))
    return [p.x, p.y, p.z]
  }, [node, nodes, edges, frames, frame, base])

  if (hasOutgoing) return null

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    addJointToNode(node.id, 'end-effector', targetPos)
  }

  return (
    <Html position={targetPos} center pointerEvents="auto">
      <button className="add-link-btn" onClick={handleClick} title="Add end effector">
        +
      </button>
    </Html>
  )
}
