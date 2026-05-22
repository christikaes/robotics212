/**
 * RevoluteJointMesh — cylinder whose orientation tracks the joint's axis/angle.
 *
 * Rotation is derived from node.axis (unit vector) + node.angle (degrees)
 * via a quaternion, not from node.rotation (world-space euler).
 */

import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useScene } from '../scene/SceneContext'
import { useSettings } from '../scene/SettingsContext'
import { perpToAxis } from '../scene/mathUtils'
import { AddLinkGizmo } from './AddLinkGizmo'
import { ExtendLinkGizmo } from './ExtendLinkGizmo'
import type { SceneNode } from '../scene/types'

const BASE_COLOR = '#f59e0b'
const SELECTED_COLOR = '#7c5cff'
const HALO_RADIUS = 0.6
const ARC_RADIUS = 0.9

/**
 * Draws an angle arc in the XZ plane (perpendicular to the joint's Y axis,
 * which is already aligned to worldAxis by the parent group's quaternion).
 *
 * - Grey spoke at 0° (reference direction, +X)
 * - Amber spoke at current angle
 * - Amber arc sweeping from 0° to current angle
 * - Angle label at arc midpoint
 */
function AngleArc({ angle }: { angle: number }) {
  const { showOverlays } = useSettings()

  const rad = (angle * Math.PI) / 180
  const absRad = Math.abs(rad)

  const { arcLine, refLine, currentLine } = useMemo(() => {
    // Arc: sweeps from 0 to angle in the XZ plane (Y = 0).
    // Right-hand rule around +Y: positive angle goes from +X toward −Z.
    const segments = Math.max(2, Math.ceil(absRad * 32))
    const arcPts: THREE.Vector3[] = []
    for (let i = 0; i <= segments; i++) {
      const t = (rad * i) / segments
      arcPts.push(new THREE.Vector3(Math.cos(t) * ARC_RADIUS, 0, -Math.sin(t) * ARC_RADIUS))
    }

    // Reference spoke: origin → +X
    const refPts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(ARC_RADIUS, 0, 0)]

    // Current angle spoke: origin → arc end
    const endX = Math.cos(rad) * ARC_RADIUS
    const endZ = -Math.sin(rad) * ARC_RADIUS
    const curPts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(endX, 0, endZ)]

    return {
      arcLine: new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(arcPts),
        new THREE.LineBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.85 }),
      ),
      refLine: new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(refPts),
        new THREE.LineBasicMaterial({ color: '#888888', transparent: true, opacity: 0.55 }),
      ),
      currentLine: new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curPts),
        new THREE.LineBasicMaterial({ color: '#f59e0b' }),
      ),
    }
  }, [rad, absRad])

  if (!showOverlays) return null

  // Label position: midpoint of the arc
  const midRad = rad / 2
  const labelPos: [number, number, number] = [
    Math.cos(midRad) * (ARC_RADIUS + 0.3),
    0,
    -Math.sin(midRad) * (ARC_RADIUS + 0.3),
  ]

  return (
    <>
      <primitive object={arcLine} />
      <primitive object={refLine} />
      <primitive object={currentLine} />

      {/* Small dot at arc end */}
      <mesh position={[Math.cos(rad) * ARC_RADIUS, 0, -Math.sin(rad) * ARC_RADIUS]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>

      {/* Angle label at arc midpoint */}
      <Html position={labelPos} center pointerEvents="none">
        <div className="overlay-label overlay-label-angle">
          {angle.toFixed(1)}°
        </div>
      </Html>
    </>
  )
}

export function RevoluteJointMesh({ node }: { node: SceneNode }) {
  const { selection, select, pendingAdd, attachAt, nodes, edges, frames } = useScene()
  const [hover, setHover] = useState(false)

  const selected = selection?.kind === 'node' && selection.id === node.id
  const isPending = pendingAdd !== null
  const isFirstPick = pendingAdd?.kind === 'link' && pendingAdd.firstId === node.id

  const frame = frames.get(node.id)
  const worldPos = frame?.worldPosition ?? node.position

  const axisQuaternion = (() => {
    // World axis = local axis rotated into world space by the parent frame's orientation.
    const localAxis = new THREE.Vector3(...(node.axis ?? [0, 0, 1])).normalize()
    const wAxis = frame
      ? localAxis.clone().applyQuaternion(frame.parentWorldQuaternion)
      : localAxis.clone()

    // Rest direction: direction to child at angle=0 (undo current rotation).
    let restDir: THREE.Vector3
    const outEdge = edges.find((e) => e.fromId === node.id)
    const child = outEdge ? nodes.find((n) => n.id === outEdge.toId) : null
    if (child) {
      const childFrame = frames.get(child.id)
      const childWorldPos = childFrame?.worldPosition ?? child.position
      const childDir = new THREE.Vector3(...childWorldPos)
        .sub(new THREE.Vector3(...worldPos))
        .normalize()
      const angleRad = ((node.angle ?? 0) * Math.PI) / 180
      restDir = childDir.applyQuaternion(
        new THREE.Quaternion().setFromAxisAngle(wAxis, -angleRad),
      )
    } else {
      restDir = perpToAxis(wAxis)
    }

    // Build explicit basis: local +X = restDir, local +Y = wAxis.
    const localZ = restDir.clone().cross(wAxis)
    const m = new THREE.Matrix4().makeBasis(restDir, wAxis, localZ)
    return new THREE.Quaternion().setFromRotationMatrix(m)
  })()

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
    <group position={worldPos} quaternion={axisQuaternion} scale={scale}>
      {/* Anchor indicator ring */}
      {node.isAnchor && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.65, 32]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}

      <mesh castShadow {...sharedProps}>
        <cylinderGeometry args={[0.35, 0.35, 0.6, 24]} />
        <meshStandardMaterial
          color={color} emissive={emissive} emissiveIntensity={emissiveIntensity}
          metalness={0.3} roughness={0.4}
        />
      </mesh>

      {/* Angle arc in the plane perpendicular to the rotation axis */}
      <AngleArc angle={node.angle ?? 0} />

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
    {selected && <ExtendLinkGizmo node={node} />}
    </>
  )
}
