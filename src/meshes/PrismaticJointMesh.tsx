/**
 * PrismaticJointMesh — housing block + shaft that extends along the outgoing link direction.
 *
 * The extension direction is derived from the first outgoing edge so the
 * visual always matches the propagation logic in SceneContext.
 */

import { useState } from 'react'
import * as THREE from 'three'
import { useScene } from '../scene/SceneContext'
import { AddLinkGizmo } from './AddLinkGizmo'
import type { SceneNode } from '../scene/types'

const BASE_COLOR = '#10b981'
const SELECTED_COLOR = '#7c5cff'
const Y_AXIS = new THREE.Vector3(0, 1, 0)

export function PrismaticJointMesh({ node }: { node: SceneNode }) {
  const { selection, select, pendingAdd, attachAt, nodes, edges, frames } = useScene()
  const [hover, setHover] = useState(false)

  const selected = selection?.kind === 'node' && selection.id === node.id
  const isPending = pendingAdd !== null
  const isFirstPick = pendingAdd?.kind === 'link' && pendingAdd.firstId === node.id

  const color = selected || isFirstPick ? SELECTED_COLOR : BASE_COLOR
  const emissive = selected || isFirstPick ? SELECTED_COLOR : '#000000'
  const emissiveIntensity = selected || isFirstPick ? 0.4 : 0
  const scale = (isPending && hover ? 1.15 : 1) * 0.5

  const frame = frames.get(node.id)
  const worldPos = frame?.worldPosition ?? node.position

  // Derive extension direction from world positions: outgoing link preferred.
  const { dirQuaternion, extension } = (() => {
    const ext = node.extension ?? 0
    const nodePos = new THREE.Vector3(...worldPos)

    const outEdge = edges.find((e) => e.fromId === node.id)
    if (outEdge) {
      const child = nodes.find((n) => n.id === outEdge.toId)
      if (child) {
        const childWorldPos = frames.get(child.id)?.worldPosition ?? child.position
        const dir = new THREE.Vector3(...childWorldPos).sub(nodePos)
        if (dir.length() > 0.001) {
          return {
            dirQuaternion: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.normalize()),
            extension: ext,
          }
        }
      }
    }

    const inEdge = edges.find((e) => e.toId === node.id)
    if (inEdge) {
      const parent = nodes.find((n) => n.id === inEdge.fromId)
      if (parent) {
        const parentWorldPos = frames.get(parent.id)?.worldPosition ?? parent.position
        const dir = nodePos.clone().sub(new THREE.Vector3(...parentWorldPos))
        if (dir.length() > 0.001) {
          return {
            dirQuaternion: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.normalize()),
            extension: ext,
          }
        }
      }
    }

    return { dirQuaternion: new THREE.Quaternion(), extension: ext }
  })()

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (pendingAdd) attachAt(node.id)
    else select({ kind: 'node', id: node.id })
  }

  const sharedProps = {
    onClick: handleClick,
    onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); setHover(true) },
    onPointerOut: () => setHover(false),
  }

  const HOUSING = 0.5  // housing half-height along direction
  const SHAFT_R = 0.12
  const shaftLength = HOUSING + extension
  const shaftOffset = shaftLength / 2  // shaft center in local Y from joint origin

  return (
    <>
    <group position={worldPos} quaternion={dirQuaternion} scale={scale}>
      {/* Anchor indicator ring */}
      {node.isAnchor && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.65, 0.75, 32]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}

      {/* Housing block — fixed size */}
      <mesh castShadow {...sharedProps}>
        <boxGeometry args={[0.5, HOUSING * 2, 0.5]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} metalness={0.3} roughness={0.4} />
      </mesh>

      {/* Extending shaft */}
      <mesh position={[0, shaftOffset, 0]} castShadow {...sharedProps}>
        <cylinderGeometry args={[SHAFT_R, SHAFT_R, shaftLength, 12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity * 0.6} metalness={0.5} roughness={0.3} />
      </mesh>

      {isPending && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={handleClick}>
          <ringGeometry args={[0.7, 0.78, 32]} />
          <meshBasicMaterial
            color={isFirstPick ? '#7c5cff' : '#22c55e'}
            transparent opacity={hover ? 0.95 : 0.6} depthWrite={false}
          />
        </mesh>
      )}
    </group>
    {selected && <AddLinkGizmo node={node} />}
    </>
  )
}
