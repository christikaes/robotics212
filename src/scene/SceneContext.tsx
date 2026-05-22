/**
 * SceneContext — central store for the robot graph plus interaction state.
 *
 * Key architectural change: node.position is now a LOCAL offset in the parent
 * frame (not world-space).  The transform engine (transformEngine.ts) computes
 * world positions for all nodes via the A/T matrix chain.  Meshes read world
 * positions from `frames`, never from node.position directly.
 *
 * node.position semantics:
 *   - Root nodes (no incoming edge / isAnchor): world position.
 *   - All other nodes: local offset expressed in the parent frame.
 *
 * updateNode no longer BFS-propagates world positions when joint variables
 * change — the engine recomputes everything automatically on the next render.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import type {
  JointKind,
  PendingKind,
  SceneEdge,
  SceneNode,
  Selection,
  Vec3,
} from './types'
import type { ProjectPreset } from '../projects/presets'
import { computeTransformFrames, rowMajorToMat4 } from './transformEngine'
import type { TransformFrame } from './transformEngine'
import { perpToAxis } from './mathUtils'
import { PRESETS } from '../projects/presets'

interface PendingAdd {
  kind: PendingKind
  stage?: 'first' | 'second'
  firstId?: string
}

interface SceneState {
  nodes: SceneNode[]
  edges: SceneEdge[]
  frames: Map<string, TransformFrame>
  selection: Selection
  selectedNode: SceneNode | null
  selectedEdge: SceneEdge | null
  pendingAdd: PendingAdd | null

  beginAdd: (kind: PendingKind) => void
  cancelAdd: () => void
  attachAt: (nodeId: string) => void

  updateNode: (id: string, patch: Partial<Pick<SceneNode, 'position' | 'rotation' | 'kind' | 'axis' | 'angle' | 'extension' | 'velocity' | 'acceleration' | 'isAnchor' | 'actuated'>>) => void
  updateEdge: (id: string, patch: Partial<Pick<SceneEdge, 'length'>>) => void
  removeNode: (id: string) => void
  removeEdge: (id: string) => void
  select: (sel: Selection) => void
  placeJoint: (kind: JointKind, position?: Vec3) => void
  addJointToNode: (parentId: string, kind: JointKind, targetPos?: Vec3) => void
  loadProject: (preset: ProjectPreset) => void
}

const SceneContext = createContext<SceneState | null>(null)

let counter = 1
const genId = (prefix: string) => `${prefix}-${counter++}`

const ZERO: Vec3 = [0, 0, 0]

export function SceneProvider({ children }: { children: ReactNode }) {
  const defaultPreset = PRESETS[0] // 2-DOF Planar RR Arm
  const [nodes, setNodes] = useState<SceneNode[]>(() => defaultPreset.nodes.map((n) => ({ ...n })))
  const [edges, setEdges] = useState<SceneEdge[]>(() => defaultPreset.edges.map((e) => ({ ...e })))
  const [selection, setSelection] = useState<Selection>(null)
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null)

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges
  const pendingRef = useRef(pendingAdd)
  pendingRef.current = pendingAdd

  // ── Transform engine ────────────────────────────────────────────────────────
  // Recomputed whenever nodes or edges change.  All meshes read world
  // positions/orientations from this map.
  const frames = useMemo(
    () => computeTransformFrames(nodes, edges),
    [nodes, edges],
  )

  // ── Joint placement ─────────────────────────────────────────────────────────
  const placeJoint = useCallback((kind: JointKind, position?: Vec3) => {
    const existing = nodesRef.current
    const isFirst = existing.length === 0
    // Standalone nodes have no parent edge → position is treated as world position.
    const pos: Vec3 = position ?? (
      isFirst ? [0, 0, 0] : [existing[existing.length - 1].position[0] + 2, 0, 0]
    )
    const id = genId(kind)
    const isActuated = kind === 'revolute' || kind === 'prismatic'
    const node: SceneNode = {
      id, kind, position: pos, rotation: [...ZERO] as Vec3,
      ...(isFirst ? { isAnchor: true } : {}),
      ...(isActuated ? { actuated: true } : {}),
    }
    setNodes((prev) => [...prev, node])
    setSelection({ kind: 'node', id })
  }, [])

  const beginAdd = useCallback((kind: PendingKind) => {
    if (kind !== 'link') {
      placeJoint(kind as JointKind)
      return
    }
    if (nodesRef.current.length === 0) return
    setSelection(null)
    setPendingAdd({ kind: 'link', stage: 'first' })
  }, [placeJoint])

  const cancelAdd = useCallback(() => setPendingAdd(null), [])

  const attachAt = useCallback((nodeId: string) => {
    const pending = pendingRef.current
    if (!pending) return

    if (pending.kind === 'link') {
      if (pending.stage === 'first') {
        setPendingAdd({ kind: 'link', stage: 'second', firstId: nodeId })
        return
      }
      if (pending.firstId && pending.firstId !== nodeId) {
        const id = genId('link')
        // Compute edge length from world positions via fresh frames.
        const currentFrames = computeTransformFrames(nodesRef.current, edgesRef.current)
        const fromFrame = currentFrames.get(pending.firstId)
        const toFrame = currentFrames.get(nodeId)
        const length = fromFrame && toFrame
          ? new THREE.Vector3(...fromFrame.worldPosition).distanceTo(
              new THREE.Vector3(...toFrame.worldPosition),
            )
          : 1.5
        setEdges((prev) => [
          ...prev,
          { id, kind: 'link', fromId: pending.firstId!, toId: nodeId, length },
        ])
      }
      setPendingAdd(null)
      return
    }

    setPendingAdd(null)
  }, [])

  // ── solvePassiveConstraints ─────────────────────────────────────────────────
  // For parallel mechanisms where a shared node has multiple incoming edges from
  // anchor joints, back-solve the passive joint angles so they visually point at
  // the shared node's current world position (which is already correct from the
  // active FK chain).
  //
  // The transform engine's visited-guard ensures the active chain's FK result
  // wins for the shared node.  The passive joints just need their display angle
  // updated so the link meshes render correctly.
  //
  // We only act on passive revolute anchor joints — those are the joints whose
  // angle doesn't affect any tree-children (they have no tree-children pointing
  // at the shared node) but whose display angle should match the geometry.
  function solvePassiveConstraints(
    nodes: SceneNode[],
    edges: SceneEdge[],
  ): SceneNode[] {
    // Find shared nodes: nodes with 2+ incoming edges from anchor joints.
    const incomingByNode = new Map<string, SceneEdge[]>()
    for (const e of edges) {
      if (!incomingByNode.has(e.toId)) incomingByNode.set(e.toId, [])
      incomingByNode.get(e.toId)!.push(e)
    }

    const sharedIds = [...incomingByNode.entries()]
      .filter(([, inEdges]) => {
        if (inEdges.length < 2) return false
        return inEdges.every((e) => {
          const src = nodes.find((n) => n.id === e.fromId)
          return src?.isAnchor === true
        })
      })
      .map(([id]) => id)

    if (sharedIds.length === 0) return nodes

    // Compute FK frames — visited-guard ensures active chain wins for shared nodes.
    const frames = computeTransformFrames(nodes, edges)

    let result = nodes

    for (const sharedId of sharedIds) {
      const sharedFrame = frames.get(sharedId)
      if (!sharedFrame) continue
      const eeWorld = new THREE.Vector3(...sharedFrame.worldPosition)

      const inEdges = incomingByNode.get(sharedId)!
      for (const inEdge of inEdges) {
        const joint = result.find((n) => n.id === inEdge.fromId)
        if (!joint || joint.kind !== 'revolute' || joint.actuated) continue

        const jointFrame = frames.get(joint.id)
        // For an anchor, parentWorldQuaternion is identity.
        const parentQ = jointFrame?.parentWorldQuaternion ?? new THREE.Quaternion()
        const jointWorld = jointFrame
          ? new THREE.Vector3(...jointFrame.worldPosition)
          : new THREE.Vector3(...joint.position)

        // Vector from joint to EE in the joint's parent frame (= world for anchors).
        const toEEWorld = eeWorld.clone().sub(jointWorld)
        const toEELocal = toEEWorld.clone().applyQuaternion(parentQ.clone().invert())

        // Local rotation axis.
        const localAxis = new THREE.Vector3(...(joint.axis ?? [0, 0, 1])).normalize()

        // Project toEELocal onto the rotation plane (⊥ localAxis).
        const toEEPlane = toEELocal.clone().sub(
          localAxis.clone().multiplyScalar(toEELocal.dot(localAxis)),
        )
        if (toEEPlane.lengthSq() < 1e-10) continue

        // Build two orthonormal basis vectors in the rotation plane.
        // u1 is the "zero-angle direction" (= local +X when axis=Z).
        const up = Math.abs(localAxis.dot(new THREE.Vector3(0, 1, 0))) < 0.9
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(1, 0, 0)
        const u1 = localAxis.clone().cross(up).normalize()
        const u2 = localAxis.clone().cross(u1).normalize()

        // Angle in the rotation plane from u1 to toEEPlane.
        const angleRad = Math.atan2(toEEPlane.dot(u2), toEEPlane.dot(u1))
        const newAngleDeg = (angleRad * 180) / Math.PI

        result = result.map((n) =>
          n.id === joint.id ? { ...n, angle: newAngleDeg } : n,
        )
      }
    }

    return result
  }

  // ── updateNode ──────────────────────────────────────────────────────────────
  // Simply patches the node.  The transform engine recomputes all world
  // positions/orientations on the next render — no BFS propagation needed.
  //
  // Special case: when a revolute joint's axis changes, we reproject all direct
  // children's p_local onto the plane perpendicular to the new axis.  This
  // prevents the arm from being parallel to the rotation axis (which would make
  // rotation have no visible effect).
  const updateNode = useCallback<SceneState['updateNode']>((id, patch) => {
    setNodes((prev) => {
      let updated = prev.map((n) => (n.id === id ? { ...n, ...patch } : n))

      // If a revolute joint's axis changed, reproject child local positions.
      if (patch.axis) {
        const node = prev.find((n) => n.id === id)
        if (node && node.kind === 'revolute') {
          const newAxis = new THREE.Vector3(...patch.axis).normalize()
          const currentEdges = edgesRef.current
          const childEdge = currentEdges.find((e) => e.fromId === id)
          if (childEdge) {
            const newPLocalDir = new Map<string, THREE.Vector3>()

            const immediateChild = updated.find((n) => n.id === childEdge.toId)
            if (immediateChild) {
              const p = new THREE.Vector3(...immediateChild.position)
              const len = p.length()
              if (len >= 0.001) {
                const axisDot = p.dot(newAxis)
                const pPerp = p.clone().sub(newAxis.clone().multiplyScalar(axisDot))
                const perpDir = pPerp.lengthSq() > 1e-6
                  ? pPerp.normalize()
                  : perpToAxis(newAxis)
                newPLocalDir.set(childEdge.toId, perpDir.clone())
              }
            }

            const queue: string[] = [childEdge.toId]
            while (queue.length > 0) {
              const parentId = queue.shift()!
              const outEdges = currentEdges.filter((e) => e.fromId === parentId)
              const parentDir = newPLocalDir.get(parentId)
              for (const e of outEdges) {
                const child = updated.find((n) => n.id === e.toId)
                if (!child) continue
                const p = new THREE.Vector3(...child.position)
                const len = p.length()
                if (len < 0.001) continue
                const dir = parentDir ? parentDir.clone() : p.clone().normalize()
                newPLocalDir.set(e.toId, dir.clone())
                queue.push(e.toId)
              }
            }

            updated = updated.map((n) => {
              const dir = newPLocalDir.get(n.id)
              if (!dir) return n
              const len = new THREE.Vector3(...n.position).length()
              if (len < 0.001) return n
              const newPos = dir.clone().multiplyScalar(len)
              return { ...n, position: [newPos.x, newPos.y, newPos.z] as Vec3 }
            })
          }
        }
      }

      // After any joint variable change (angle, extension), solve passive
      // constraints so that passive joints in parallel mechanisms maintain
      // their link lengths.
      if (patch.angle !== undefined || patch.extension !== undefined) {
        updated = solvePassiveConstraints(updated, edgesRef.current)
      }

      return updated
    })
  }, [])

  // ── addJointToNode ──────────────────────────────────────────────────────────
  // targetPos is in WORLD space.  We convert it to local space (in the parent
  // frame) using the parent's current cumulative transform matrix.
  const addJointToNode = useCallback((parentId: string, kind: JointKind, targetPos?: Vec3) => {
    const currentNodes = nodesRef.current
    const currentEdges = edgesRef.current
    const parent = currentNodes.find((n) => n.id === parentId)
    if (!parent) return

    const currentFrames = computeTransformFrames(currentNodes, currentEdges)
    const parentFrame = currentFrames.get(parentId)

    let localPos: Vec3
    let edgeLength: number

    if (targetPos && parentFrame) {
      // Convert world targetPos → local position in parent frame
      const T_parent = rowMajorToMat4(parentFrame.cumulativeMatrix)
      const T_inv = T_parent.clone().invert()
      const localVec = new THREE.Vector3(...targetPos).applyMatrix4(T_inv)
      localPos = [localVec.x, localVec.y, localVec.z]
      edgeLength = new THREE.Vector3(...parentFrame.worldPosition)
        .distanceTo(new THREE.Vector3(...targetPos))
    } else {
      // No target or no frame yet — default 1.5 units in local +X
      localPos = [1.5, 0, 0]
      edgeLength = 1.5
    }

    const newNodeId = genId(kind)
    const newEdgeId = genId('link')
    const isActuated = kind === 'revolute' || kind === 'prismatic'
    const node: SceneNode = { id: newNodeId, kind, position: localPos, rotation: [...ZERO] as Vec3, ...(isActuated ? { actuated: true } : {}) }
    setNodes((prev) => [...prev, node])
    setEdges((prev) => [
      ...prev,
      { id: newEdgeId, kind: 'link', fromId: parentId, toId: newNodeId, length: edgeLength },
    ])
  }, [])

  // ── removeNode / removeEdge ─────────────────────────────────────────────────
  const removeNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id))
    setEdges((prev) => prev.filter((e) => e.fromId !== id && e.toId !== id))
    setSelection((s) => (s?.kind === 'node' && s.id === id ? null : s))
  }, [])

  const removeEdge = useCallback((id: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== id))
    setSelection((s) => (s?.kind === 'edge' && s.id === id ? null : s))
  }, [])

  // ── updateEdge ──────────────────────────────────────────────────────────────
  // When the length changes, rescale the child's local position vector
  // (keeping the same direction, changing only the magnitude).
  const updateEdge = useCallback((id: string, patch: Partial<Pick<SceneEdge, 'length'>>) => {
    setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))

    if (patch.length !== undefined) {
      const edge = edgesRef.current.find((e) => e.id === id)
      if (!edge) return
      const toNode = nodesRef.current.find((n) => n.id === edge.toId)
      if (!toNode) return

      const oldLocal = new THREE.Vector3(...toNode.position)
      const len = oldLocal.length()
      if (len < 0.001) return

      const newLocal = oldLocal.clone().normalize().multiplyScalar(patch.length)
      setNodes((prev) =>
        prev.map((n) =>
          n.id === toNode.id
            ? { ...n, position: [newLocal.x, newLocal.y, newLocal.z] as Vec3 }
            : n,
        ),
      )
    }
  }, [])

  // ── loadProject ─────────────────────────────────────────────────────────────
  const loadProject = useCallback((preset: ProjectPreset) => {
    setNodes(preset.nodes)
    setEdges(preset.edges)
    setSelection(null)
    setPendingAdd(null)
  }, [])

  const select = useCallback((sel: Selection) => setSelection(sel), [])

  const selectedNode = useMemo(
    () => (selection?.kind === 'node' ? nodes.find((n) => n.id === selection.id) ?? null : null),
    [selection, nodes],
  )
  const selectedEdge = useMemo(
    () => (selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) ?? null : null),
    [selection, edges],
  )

  const value: SceneState = {
    nodes,
    edges,
    frames,
    selection,
    selectedNode,
    selectedEdge,
    pendingAdd,
    beginAdd,
    cancelAdd,
    attachAt,
    updateNode,
    removeNode,
    removeEdge,
    updateEdge,
    select,
    placeJoint,
    addJointToNode,
    loadProject,
  }

  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>
}

export function useScene() {
  const ctx = useContext(SceneContext)
  if (!ctx) throw new Error('useScene must be used inside <SceneProvider>')
  return ctx
}
