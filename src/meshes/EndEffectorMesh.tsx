/**
 * EndEffectorMesh — Parallel-jaw gripper / grabber:
 *   - Wrist cylinder (base)
 *   - Palm block connecting wrist to fingers
 *   - Two symmetric finger assemblies, each made of:
 *       • a proximal bar angled slightly outward
 *       • a distal bar pointing straight down (jaw)
 *       • a small fingertip pad
 *
 * All geometry is purely Three.js primitives — no external models.
 * Interaction (click, hover, pending-add halo) is unchanged from the
 * original TCP frame marker.
 */

import { useState } from 'react'
import * as THREE from 'three'
import { useScene } from '../scene/SceneContext'
import type { SceneNode } from '../scene/types'

const Y_AXIS = new THREE.Vector3(0, 1, 0)

const SELECTED_COLOR = '#7c5cff'
const HALO_RADIUS = 0.65

// ── Material colors ────────────────────────────────────────────────────────────
const BODY_COLOR   = '#e11d48'  // rose-red (normal)
const FINGER_COLOR = '#c0c0c8'  // light metal grey for fingers

// ── Geometry constants (all in local units, group scale = 0.5) ────────────────
const WRIST_R    = 0.22   // wrist cylinder radius
const WRIST_H    = 0.28   // wrist cylinder height
const PALM_W     = 0.52   // palm block width  (spans both fingers)
const PALM_H     = 0.12   // palm block height
const PALM_D     = 0.18   // palm block depth

const FINGER_W   = 0.09   // finger bar cross-section width
const FINGER_D   = 0.09   // finger bar cross-section depth
const PROX_H     = 0.30   // proximal bar height
const DIST_H     = 0.38   // distal (jaw) bar height
const SPREAD     = 0.215  // half-distance between finger centres

const PAD_W      = 0.11
const PAD_H      = 0.06
const PAD_D      = 0.14

// Slight outward splay angle for the proximal bar (radians)
const SPLAY = 0.18

export function EndEffectorMesh({ node }: { node: SceneNode }) {
  const { selection, select, pendingAdd, attachAt, nodes, edges, frames } = useScene()
  const [hover, setHover] = useState(false)

  const selected    = selection?.kind === 'node' && selection.id === node.id
  const isPending   = pendingAdd !== null
  const isFirstPick = pendingAdd?.kind === 'link' && pendingAdd.firstId === node.id

  const frame     = frames.get(node.id)
  const worldPos  = frame?.worldPosition ?? node.position

  // Orient the gripper so its +Y (wrist→fingers) points along the incoming link.
  const dirQuaternion = (() => {
    const nodePos = new THREE.Vector3(...worldPos)
    const inEdge  = edges.find((e) => e.toId === node.id)
    if (inEdge) {
      const parent = nodes.find((n) => n.id === inEdge.fromId)
      if (parent) {
        const parentPos = new THREE.Vector3(...(frames.get(parent.id)?.worldPosition ?? parent.position))
        const dir = nodePos.clone().sub(parentPos)
        if (dir.length() > 0.001) {
          return new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.normalize().negate())
        }
      }
    }
    return new THREE.Quaternion()
  })()

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (pendingAdd) attachAt(node.id)
    else select({ kind: 'node', id: node.id })
  }

  const sharedProps = {
    onClick: handleClick,
    onPointerDown:  (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onPointerOver:  (e: { stopPropagation: () => void }) => { e.stopPropagation(); setHover(true) },
    onPointerOut:   () => setHover(false),
  }

  const bodyColor        = selected || isFirstPick ? SELECTED_COLOR : BODY_COLOR
  const emissive         = selected || isFirstPick ? SELECTED_COLOR : '#000000'
  const emissiveIntensity = selected || isFirstPick ? 0.45 : 0
  const scale            = (isPending && hover ? 1.15 : 1) * 0.5

  // Shared material props for the coloured wrist/palm body
  const bodyMat = (
    <meshStandardMaterial
      color={bodyColor}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      metalness={0.5}
      roughness={0.25}
    />
  )

  // Shared material for the metal finger parts
  const fingerMat = (
    <meshStandardMaterial
      color={FINGER_COLOR}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity * 0.4}
      metalness={0.7}
      roughness={0.2}
    />
  )

  // ── Finger helper: renders one proximal bar + distal jaw + fingertip pad ────
  // sign = +1 (left finger) or -1 (right finger)
  function Finger({ sign }: { sign: 1 | -1 }) {
    const proxOffsetX = sign * SPREAD
    const proxOffsetY = -(PALM_H / 2 + PROX_H / 2 * Math.cos(SPLAY))

    // Distal bar hangs below the proximal bar end
    const proxBottomX = proxOffsetX + sign * (PROX_H / 2) * Math.sin(SPLAY)
    const proxBottomY = proxOffsetY - (PROX_H / 2) * Math.cos(SPLAY)
    const distOffsetX = proxBottomX
    const distOffsetY = proxBottomY - DIST_H / 2

    // Fingertip pad at the very bottom
    const padY = distOffsetY - DIST_H / 2 - PAD_H / 2

    return (
      <group>
        {/* Proximal bar — slightly splayed */}
        <mesh
          position={[proxOffsetX, proxOffsetY, 0]}
          rotation={[0, 0, sign * SPLAY]}
          castShadow
        >
          <boxGeometry args={[FINGER_W, PROX_H, FINGER_D]} />
          {fingerMat}
        </mesh>

        {/* Distal jaw bar — straight down */}
        <mesh position={[distOffsetX, distOffsetY, 0]} castShadow>
          <boxGeometry args={[FINGER_W, DIST_H, FINGER_D]} />
          {fingerMat}
        </mesh>

        {/* Fingertip pad — inner face slightly inset */}
        <mesh position={[distOffsetX, padY, 0]} castShadow>
          <boxGeometry args={[PAD_W, PAD_H, PAD_D]} />
          <meshStandardMaterial
            color="#333340"
            emissive={emissive}
            emissiveIntensity={emissiveIntensity * 0.2}
            metalness={0.1}
            roughness={0.8}
          />
        </mesh>
      </group>
    )
  }

  return (
    <group position={worldPos} quaternion={dirQuaternion} scale={scale}>
      {/* Anchor ring (world-origin nodes only) */}
      {node.isAnchor && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.65, 32]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}

      {/* ── Wrist cylinder (clickable — drives selection) ─────────────────── */}
      <mesh
        position={[0, WRIST_H / 2, 0]}
        castShadow
        {...sharedProps}
      >
        <cylinderGeometry args={[WRIST_R, WRIST_R * 0.85, WRIST_H, 16]} />
        {bodyMat}
      </mesh>

      {/* ── Palm block ────────────────────────────────────────────────────── */}
      <mesh position={[0, 0, 0]} castShadow {...sharedProps}>
        <boxGeometry args={[PALM_W, PALM_H, PALM_D]} />
        {bodyMat}
      </mesh>

      {/* ── Left finger ───────────────────────────────────────────────────── */}
      <Finger sign={1} />

      {/* ── Right finger ──────────────────────────────────────────────────── */}
      <Finger sign={-1} />

      {/* ── Attachment halo (pending-add mode) ────────────────────────────── */}
      {isPending && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={handleClick}>
          <ringGeometry args={[HALO_RADIUS, HALO_RADIUS + 0.08, 32]} />
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
