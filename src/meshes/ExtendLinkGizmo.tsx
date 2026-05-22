/**
 * ExtendLinkGizmo — a second "+" button that appears for revolute joints.
 *
 * It is positioned in the **extension direction**: the same direction as the
 * incoming link (parent → current node), continued forward.  Clicking it adds
 * a new revolute joint at that position, extending the kinematic chain.
 *
 * This gizmo is intentionally separate from AddLinkGizmo (which places a child
 * in the arm/rotation direction) so the two intents are spatially distinct.
 *
 * Only rendered by RevoluteJointMesh when the joint is selected and has no
 * outgoing edge.  Hidden for root anchors (no incoming edge → no direction).
 */

import { useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useScene } from '../scene/SceneContext'
import type { SceneNode, Vec3 } from '../scene/types'

const LINK_LENGTH = 2.0

export function ExtendLinkGizmo({ node }: { node: SceneNode }) {
  const { addJointToNode, nodes, edges, frames } = useScene()

  const hasOutgoing = edges.some((e) => e.fromId === node.id)

  const frame = frames.get(node.id)
  const worldPos = frame?.worldPosition ?? node.position

  // Extension direction: from parent world pos → this node world pos, continued.
  const extendPos = useMemo<Vec3 | null>(() => {
    const base = new THREE.Vector3(...worldPos)

    const inEdge = edges.find((e) => e.toId === node.id)
    if (!inEdge) return null

    const parent = nodes.find((n) => n.id === inEdge.fromId)
    if (!parent) return null

    const parentWorldPos = frames.get(parent.id)?.worldPosition ?? parent.position
    const dir = base.clone().sub(new THREE.Vector3(...parentWorldPos)).normalize()
    const p = base.clone().add(dir.multiplyScalar(LINK_LENGTH))
    return [p.x, p.y, p.z]
  }, [node, nodes, edges, frames, worldPos])

  // Hide when there is already a child, or no valid extension direction.
  if (hasOutgoing || extendPos === null) return null

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    addJointToNode(node.id, 'revolute', extendPos)
  }

  return (
    <Html position={extendPos} center pointerEvents="auto">
      <button
        className="add-link-btn add-link-btn-extend"
        onClick={handleClick}
        title="Extend chain (add revolute joint)"
      >
        +
      </button>
    </Html>
  )
}
