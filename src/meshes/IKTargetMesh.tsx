/**
 * IKTargetMesh — 3D marker for the IK target position.
 *
 * Rendered as:
 *   - A semi-transparent sphere (the target "ball")
 *   - Three thin rings (one per axis) forming a crosshair / gimbal look
 *
 * Colour:
 *   - Orange while the simulation is playing / solver is iterating
 *   - Green once the solver has converged (and simulation stopped)
 *
 * Only rendered when there is at least one end-effector in the scene.
 */

import { useMemo } from 'react'
import * as THREE from 'three'
import { useIK } from '../scene/IKContext'

const SPHERE_R = 0.18
const RING_INNER = 0.22
const RING_OUTER = 0.28
const RING_SEGMENTS = 64

// Pre-built rotation matrices for the three axis rings
const ROT_X = new THREE.Euler(Math.PI / 2, 0, 0) // ring in XZ plane → around X
const ROT_Y = new THREE.Euler(0, 0, 0)            // ring in XY plane → default
const ROT_Z = new THREE.Euler(0, 0, Math.PI / 2)  // ring in YZ plane → around Z

interface IKTargetMeshProps {
  /** Whether the solver has converged (drives colour). */
  converged: boolean
  /** Whether to render at all (hide when no EE in scene). */
  visible: boolean
}

export function IKTargetMesh({ converged, visible }: IKTargetMeshProps) {
  const { target, isPlaying } = useIK()

  const color = converged && !isPlaying ? '#22c55e' : '#f97316'

  const ringGeom = useMemo(() => {
    return new THREE.RingGeometry(RING_INNER, RING_OUTER, RING_SEGMENTS)
  }, [])

  if (!visible) return null

  return (
    <group position={target}>
      {/* Central sphere */}
      <mesh>
        <sphereGeometry args={[SPHERE_R, 24, 24]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>

      {/* Wireframe outline */}
      <mesh>
        <sphereGeometry args={[SPHERE_R + 0.01, 16, 16]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.3} />
      </mesh>

      {/* Ring — XY plane (around Z axis by default) */}
      <mesh rotation={ROT_Y}>
        <primitive object={ringGeom} />
        <meshBasicMaterial
          color={color}
          side={THREE.DoubleSide}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Ring — XZ plane */}
      <mesh rotation={ROT_X}>
        <primitive object={ringGeom} />
        <meshBasicMaterial
          color={color}
          side={THREE.DoubleSide}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Ring — YZ plane */}
      <mesh rotation={ROT_Z}>
        <primitive object={ringGeom} />
        <meshBasicMaterial
          color={color}
          side={THREE.DoubleSide}
          transparent
          opacity={0.7}
        />
      </mesh>
    </group>
  )
}
