/**
 * SphericalJointMesh — ball-and-socket joint (3 DOF, no specific axis).
 */

import { useState } from 'react'
import { useScene } from '../scene/SceneContext'
import { AddLinkGizmo } from './AddLinkGizmo'
import type { SceneNode } from '../scene/types'

const BASE_COLOR = '#a855f7'
const SELECTED_COLOR = '#7c5cff'
const HALO_RADIUS = 0.6

export function SphericalJointMesh({ node }: { node: SceneNode }) {
  const { selection, select, pendingAdd, attachAt, frames } = useScene()
  const [hover, setHover] = useState(false)

  const selected = selection?.kind === 'node' && selection.id === node.id
  const isPending = pendingAdd !== null
  const isFirstPick = pendingAdd?.kind === 'link' && pendingAdd.firstId === node.id

  const worldPos = frames.get(node.id)?.worldPosition ?? node.position

  const color = selected || isFirstPick ? SELECTED_COLOR : BASE_COLOR
  const emissive = selected || isFirstPick ? SELECTED_COLOR : '#000000'
  const emissiveIntensity = selected || isFirstPick ? 0.4 : 0
  const scale = (isPending && hover ? 1.15 : 1) * 0.5

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

  return (
    <>
    <group position={worldPos} scale={scale}>
      {/* Anchor indicator ring */}
      {node.isAnchor && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.65, 32]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}

      <mesh castShadow {...sharedProps}>
        <sphereGeometry args={[0.38, 24, 24]} />
        <meshStandardMaterial
          color={color} emissive={emissive} emissiveIntensity={emissiveIntensity}
          metalness={0.3} roughness={0.4}
        />
      </mesh>

      {isPending && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={handleClick}>
          <ringGeometry args={[HALO_RADIUS, HALO_RADIUS + 0.08, 32]} />
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
