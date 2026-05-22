/**
 * SelectableMesh — wraps a node mesh with selection + attach behavior.
 *
 * Click semantics depend on global mode:
 *   - No pendingAdd: click selects the node.
 *   - pendingAdd active: click attaches the in-progress element to this node.
 *
 * When pendingAdd is active, every node also shows a glowing halo and a
 * hover scale to advertise that it's a valid attachment target.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useScene } from '../scene/SceneContext'
import type { SceneNode } from '../scene/types'
import type { Vec3 } from '../scene/types'

interface Props {
  node: SceneNode
  baseColor: string
  haloRadius?: number
  children: ReactNode
}

export function SelectableMesh({ node, baseColor, haloRadius = 0.7, children }: Props) {
  const { selection, select, pendingAdd, attachAt, frames } = useScene()
  const [hover, setHover] = useState(false)

  const selected = selection?.kind === 'node' && selection.id === node.id
  const isPending = pendingAdd !== null
  const isFirstPick = pendingAdd?.kind === 'link' && pendingAdd.firstId === node.id

  const worldPos: Vec3 = frames.get(node.id)?.worldPosition ?? node.position

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (pendingAdd) {
      attachAt(node.id)
    } else {
      select({ kind: 'node', id: node.id })
    }
  }

  return (
    <group position={worldPos} rotation={node.rotation}>
      <mesh
        onClick={handleClick}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
        }}
        onPointerOut={() => setHover(false)}
        scale={isPending && hover ? 1.15 : 1}
        castShadow
      >
        {children}
        <meshStandardMaterial
          color={selected || isFirstPick ? '#7c5cff' : baseColor}
          emissive={selected || isFirstPick ? '#7c5cff' : '#000000'}
          emissiveIntensity={selected || isFirstPick ? 0.4 : 0}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>

      {/* Attachment halo: rendered when we're in add mode */}
      {isPending && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={handleClick}>
          <ringGeometry args={[haloRadius, haloRadius + 0.08, 32]} />
          <meshBasicMaterial
            color={isFirstPick ? '#7c5cff' : '#22c55e'}
            transparent
            opacity={hover ? 0.95 : 0.6}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}
