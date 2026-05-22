/**
 * LinkEdgeMesh — rigid bar drawn between two node positions.
 *
 * The bar is a thin box stretched along the from→to vector, then rotated to
 * align with that direction. Selected and hovered states are visually
 * distinct, and a click selects the underlying edge.
 */

import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { useScene } from '../scene/SceneContext'
import type { SceneEdge, Vec3 } from '../scene/types'

interface Props {
  edge: SceneEdge
  from: Vec3
  to: Vec3
  singular?: boolean
}

const Y_AXIS = new THREE.Vector3(0, 1, 0)

export function LinkEdgeMesh({ edge, from, to, singular = false }: Props) {
  const { selection, select } = useScene()
  const [hover, setHover] = useState(false)

  const selected = selection?.kind === 'edge' && selection.id === edge.id

  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const dir = b.clone().sub(a)
    const len = Math.max(dir.length(), 0.001)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.clone().normalize())
    return { position: mid, quaternion: q, length: len }
  }, [from, to])

  return (
    <mesh
      position={position}
      quaternion={quaternion}
      onClick={(e) => {
        e.stopPropagation()
        select({ kind: 'edge', id: edge.id })
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
      }}
      onPointerOut={() => setHover(false)}
      castShadow
    >
      <cylinderGeometry args={[0.05, 0.05, length, 12]} />
      <meshStandardMaterial
        color={selected ? '#7c5cff' : singular ? '#ef4444' : hover ? '#cbd5e1' : '#94a3b8'}
        emissive={selected ? '#7c5cff' : singular ? '#ef4444' : '#000000'}
        emissiveIntensity={selected ? 0.4 : singular ? 0.3 : 0}
        metalness={0.3}
        roughness={0.4}
      />
    </mesh>
  )
}
