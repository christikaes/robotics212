/**
 * transformEngine.ts — Forward kinematics engine via 4×4 homogeneous A-matrices.
 *
 * Implements the Asada (MIT 2.12) consecutive coordinate transformation:
 *
 *   Each joint i has a local A-matrix:
 *
 *       A_i = [ R_i  |  p_i ]
 *             [ 0 0 0|   1  ]
 *
 *   where:
 *     R_i  — 3×3 rotation contributed by joint i's variable (θ for revolute)
 *     p_i  — position of frame i's origin expressed in the PARENT frame
 *            (stored as node.position for all nodes with a parent edge;
 *             for root nodes with no incoming edge, node.position is world position)
 *
 *   Cumulative world transform for joint n:
 *     T_0n = A_root × A_1 × A_2 × ... × A_n
 *
 *   World position of joint n = top-right 3×1 column of T_0n.
 *   World orientation of joint n's OUTPUT frame = rotation part of T_0n.
 *
 * This engine is the single source of truth for 3D world positions and
 * orientations.  Mesh components read from the frames map; they do NOT read
 * node.position directly for placement.
 *
 * References:
 *   Lecture 5 (Rotation Matrices, Consecutive Coordinate Transformation)
 *   Lecture 6 (4×4 Homogeneous Transformation, Denavit-Hartenberg Notation)
 */

import * as THREE from 'three'
import type { SceneNode, SceneEdge, Vec3 } from './types'
import {
  type SymMatrix,
  type SymVec3,
  SYM_IDENTITY,
  SYM_ZERO_VEC3,
  scalar,
  symAdd,
  symMul,
  numericToSymExpr,
  symVecAdd,
  symMatVecMul,
  symRotationMatrix,
  symMatMul,
  exprToString,
} from './symMatrix'

/** Convert a positive integer to Unicode subscript digits (e.g. 12 → "₁₂"). */
const SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉'
function sub(n: number): string {
  return String(n).split('').map((d) => SUB_DIGITS[parseInt(d)] ?? d).join('')
}

// ─── Output types ──────────────────────────────────────────────────────────────

export interface TransformFrame {
  /** The scene node at this frame. */
  node: SceneNode

  /**
   * 4×4 A-matrix for this node: [R_i | p_local ; 0 0 0 1], row-major (16 values).
   * R_i  = rotation contributed by this joint's variable.
   * p_local = node.position (local offset in parent frame).
   */
  aMatrix: number[]

  /**
   * Cumulative world transform T_0i = T_parent × A_i, row-major (16 values).
   * For a root node this equals A_i.
   */
  cumulativeMatrix: number[]

  /**
   * World position of this frame's origin, extracted from the last column of
   * cumulativeMatrix.  This is what 3D meshes use for their position prop.
   */
  worldPosition: Vec3

  /**
   * Quaternion representing the orientation of this frame's OUTPUT coordinate
   * system in world space (i.e., after applying this joint's rotation).
   * = parentWorldQuaternion × jointRotationQuaternion
   */
  worldQuaternion: THREE.Quaternion

  /**
   * Quaternion representing the orientation of this frame's INPUT coordinate
   * system — i.e., the world rotation of the parent frame.
   * Used to map local-frame vectors (e.g., joint axis) to world space:
   *   worldAxis = localAxis.applyQuaternion(parentWorldQuaternion)
   */
  parentWorldQuaternion: THREE.Quaternion

  /**
   * For revolute joints: the joint angle in radians used to build R_i.
   * Undefined for non-revolute nodes (prismatic, end-effector, etc.).
   * Stored here so the angle value is visible in the debugger alongside
   * the matrix rather than being hidden inside the quaternion.
   */
  angleRad?: number

  /**
   * cos(angleRad) — the value that ends up in the rotation block of A_i.
   * Undefined for non-revolute nodes.
   */
  cosTheta?: number

  /**
   * sin(angleRad) — the value that ends up in the rotation block of A_i.
   * Undefined for non-revolute nodes.
   */
  sinTheta?: number

  // ── Cumulative T_0i trig ──────────────────────────────────────────────────

  /**
   * Symbolic 3×3 rotation block of T_0i, row-major (9 strings).
   *
   * Each entry is computed by directly multiplying the individual symbolic
   * rotation matrices for every revolute joint in the chain:
   *
   *   R_T = R_root × R_1 × R_2 × … × R_i
   *
   * Labels: cθ / sθ for a single-joint chain, c₁/s₁ c₂/s₂ … for multi-joint.
   * Non-revolute nodes contribute identity rotation so they leave no label.
   *
   * Examples (Z-axis chain):
   *   1 joint  → "cθ",  "-sθ", "0", "sθ", "cθ", "0", "0", "0", "1"
   *   2 joints → "c₁c₂-s₁s₂", "-c₁s₂-s₁c₂", …
   */
  symbolicCumulativeRotation: string[]

  /**
   * Symbolic translation column of T_0i (3 entries: x, y, z).
   *
   * Propagated as:  p_T[i] = R_parent_sym × p_local_sym[i] + p_T[i-1]
   *
   * For revolute/non-prismatic joints, p_local is a static numeric offset;
   * after multiplication by the accumulated symbolic rotation the result
   * carries trig labels (e.g. "cθ·0.5+1").
   *
   * For prismatic joints, p_local includes a symbolic extension variable:
   *   p_local_sym = node.position + dir * d_i
   * so the final expression shows e.g. "1+d" for a unit-Z prismatic.
   *
   * Labels: d / d₁ d₂ … (same subscript logic as revolute θ labels).
   */
  symbolicCumulativeTranslation: string[]

  /**
   * Ordered trig snapshots for every revolute joint from root to this node.
   * Non-revolute joints are omitted (identity rotation, no trig).
   * Kept for debugging and label-count metadata.
   */
  cumulativeFactors: Array<{
    nodeId: string
    angleRad: number
    cosTheta: number
    sinTheta: number
    axis: Vec3
  }>
}

/**
 * Extended frame used by the Transforms panel: includes chain metadata on top
 * of the base TransformFrame fields.
 */
export interface KinematicFrame extends TransformFrame {
  /** 0-based index of this node in the displayed chain. */
  frameIndex: number

  /** True if this is the node the user selected. */
  isSelected: boolean

  /**
   * Local position used as the p column in A_i:
   *   - root nodes (no incoming edge): equals worldPosition (world origin = parent frame)
   *   - all other nodes: equals node.position (local offset in parent frame)
   */
  relativePosition: Vec3
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a THREE.Matrix4 to a row-major number[16] array. */
export function mat4ToRowMajor(m: THREE.Matrix4): number[] {
  // THREE.Matrix4.elements is column-major
  const e = m.elements
  return [
    e[0], e[4], e[8],  e[12],
    e[1], e[5], e[9],  e[13],
    e[2], e[6], e[10], e[14],
    e[3], e[7], e[11], e[15],
  ]
}

/**
 * Rebuild a THREE.Matrix4 from a row-major number[16] array.
 * THREE.Matrix4.set() accepts arguments in row-major order.
 */
export function rowMajorToMat4(rm: number[]): THREE.Matrix4 {
  const m = new THREE.Matrix4()
  m.set(
    rm[0],  rm[1],  rm[2],  rm[3],
    rm[4],  rm[5],  rm[6],  rm[7],
    rm[8],  rm[9],  rm[10], rm[11],
    rm[12], rm[13], rm[14], rm[15],
  )
  return m
}

// ─── Main engine ──────────────────────────────────────────────────────────────

/**
 * Walk the full scene graph from every root node (nodes with no incoming edge)
 * and compute a TransformFrame for every reachable node.
 *
 * node.position semantics:
 *   - Root nodes (no incoming edge, or isAnchor): world position.
 *   - All other nodes: local offset in the parent frame's coordinate system.
 *
 * Returns a Map from node ID → TransformFrame.
 */
export function computeTransformFrames(
  nodes: SceneNode[],
  edges: SceneEdge[],
): Map<string, TransformFrame> {
  const result = new Map<string, TransformFrame>()

  // Root nodes are those with no incoming edge.
  const rootNodes = nodes.filter((n) => !edges.some((e) => e.toId === n.id))

  type CumulativeFactor = TransformFrame['cumulativeFactors'][number]

  function visit(
    node: SceneNode,
    parentT: THREE.Matrix4,
    parentQuat: THREE.Quaternion,
    parentFactors: CumulativeFactor[],
    parentSymRot: SymMatrix,
    parentSymTrans: SymVec3,
    parentPrismCount: number,
  ): void {
    // ── Guard: skip nodes already computed (cross-edges in parallel mechanisms).
    // The first visit (via the tree-parent chain) wins; passive cross-edges do
    // not overwrite the active-chain world position.
    if (result.has(node.id)) return

    // ── Local translation p_local ─────────────────────────────────────────────
    const p_local = new THREE.Vector3(...node.position)

    // ── Joint rotation R_i ────────────────────────────────────────────────────
    // Revolute joints contribute a rotation about their local axis.
    // All other joint kinds contribute identity rotation (translation only).
    //
    // angleRad / cosTheta / sinTheta are recorded explicitly so the trig
    // values that go into R_i are visible in the debugger alongside the matrix.
    let jointQ = new THREE.Quaternion() // identity
    let angleRad: number | undefined
    let cosTheta: number | undefined
    let sinTheta: number | undefined

    if (node.kind === 'revolute') {
      const localAxis = new THREE.Vector3(...(node.axis ?? [0, 0, 1])).normalize()
      angleRad = ((node.angle ?? 0) * Math.PI) / 180
      cosTheta = Math.cos(angleRad)
      sinTheta = Math.sin(angleRad)

      jointQ.setFromAxisAngle(localAxis, angleRad)
    }

    // ── Build cumulativeFactors: parent's list + this joint (if revolute) ─────
    const cumulativeFactors: CumulativeFactor[] = angleRad !== undefined
      ? [
          ...parentFactors,
          {
            nodeId: node.id,
            angleRad,
            cosTheta: cosTheta!,
            sinTheta: sinTheta!,
            axis: [...(node.axis ?? [0, 0, 1])] as Vec3,
          },
        ]
      : [...parentFactors]

    // ── Symbolic rotation: R_T = parentSymRot × R_i ───────────────────────────
    // For a single-joint chain the angle label is "θ" (matching the A matrix).
    // For multi-joint chains the label is "θ₁", "θ₂", … based on position.
    // We use the factor count AFTER appending this joint to get the right index.
    let symRot: SymMatrix = parentSymRot
    if (node.kind === 'revolute') {
      const idx = cumulativeFactors.length   // 1-based index of this joint
      const label = `${idx}`
      const cosLabel = `c${label}`
      const sinLabel = `s${label}`
      const axis = (node.axis ?? [0, 0, 1]) as [number, number, number]
      const thisSymRot = symRotationMatrix(axis, cosLabel, sinLabel)
      symRot = symMatMul(parentSymRot, thisSymRot)
    }

    // Flatten the 3×3 symbolic rotation to a 9-element string array (row-major).
    const symbolicCumulativeRotation = symRot.flat().map(exprToString)

    // ── Symbolic translation: p_T = parentSymRot × p_local_sym + parentSymTrans ──
    // p_local_sym: for prismatic joints the static offset (p_local) is used for
    // the joint's own cumulative translation. The extension variable d is added
    // only when passing symTrans down to children (stretches the outgoing link).
    let prismCount = parentPrismCount
    const rawPos = node.position as [number, number, number]

    let p_local_sym: SymVec3
    let p_local_sym_extended: SymVec3   // with d term, used for children only
    if (node.kind === 'prismatic') {
      prismCount = parentPrismCount + 1
      const label = prismCount === 1 ? 'd' : `d${sub(prismCount)}`
      const dSym = scalar(label)
      const len = Math.sqrt(rawPos[0] ** 2 + rawPos[1] ** 2 + rawPos[2] ** 2)
      // Static base (no d): placed on the joint's own frame
      p_local_sym = rawPos.map(numericToSymExpr) as SymVec3
      // Extended (with d): passed to children so d stretches the outgoing link
      p_local_sym_extended = rawPos.map((v) => {
        const dirV = len > 1e-9 ? v / len : 0
        const base = numericToSymExpr(v)
        if (Math.abs(dirV) < 1e-9) return base
        const dirExpr = numericToSymExpr(dirV)
        return symAdd(base, symMul(dirExpr, dSym))
      }) as SymVec3
    } else {
      // Static numeric offset — may still get trig labels after rotation.
      p_local_sym = rawPos.map(numericToSymExpr) as SymVec3
      p_local_sym_extended = p_local_sym
    }

    const symTrans: SymVec3 = symVecAdd(
      parentSymTrans,
      symMatVecMul(parentSymRot, p_local_sym),
    )
    // symTrans passed to children includes the extension term for prismatic joints
    const symTransForChildren: SymVec3 = node.kind === 'prismatic'
      ? symVecAdd(parentSymTrans, symMatVecMul(parentSymRot, p_local_sym_extended))
      : symTrans
    const symbolicCumulativeTranslation = symTrans.map(exprToString)

    // ── A_i = [ R_i | p_local ; 0 1 ] ────────────────────────────────────────
    const A_i = new THREE.Matrix4()
    A_i.makeRotationFromQuaternion(jointQ) // sets 3×3 rotation, zeros translation
    A_i.setPosition(p_local)              // sets translation column

    // ── T_0i = T_parent × A_i ─────────────────────────────────────────────────
    const T_i = parentT.clone().multiply(A_i)

    // ── Extract world position and orientation ────────────────────────────────
    const worldPos = new THREE.Vector3().setFromMatrixPosition(T_i)
    const worldQuat = new THREE.Quaternion().setFromRotationMatrix(T_i)

    result.set(node.id, {
      node,
      aMatrix: mat4ToRowMajor(A_i),
      cumulativeMatrix: mat4ToRowMajor(T_i),
      worldPosition: [worldPos.x, worldPos.y, worldPos.z],
      worldQuaternion: worldQuat,
      parentWorldQuaternion: parentQuat.clone(),
      angleRad,
      cosTheta,
      sinTheta,
      symbolicCumulativeRotation,
      symbolicCumulativeTranslation,
      cumulativeFactors,
    })

    // ── Recurse to children ───────────────────────────────────────────────────
    // For prismatic joints: the extension shifts the outgoing link, not the
    // incoming one. We inject it as an extra translation into the child's
    // parent transform so that the prismatic joint's own world position is
    // unchanged but all its children are pushed further along the slide axis.
    let T_forChildren = T_i
    if (node.kind === 'prismatic') {
      const ext = node.extension ?? 0
      if (ext !== 0) {
        const len = p_local.length()
        if (len > 0.001) {
          const dir = p_local.clone().normalize()
          // dir is in the prismatic joint's parent frame; rotate it to world frame.
          const worldDir = dir.clone().applyQuaternion(worldQuat)
          const extTranslation = new THREE.Matrix4().makeTranslation(
            worldDir.x * ext,
            worldDir.y * ext,
            worldDir.z * ext,
          )
          T_forChildren = extTranslation.multiply(T_i)
        }
      }
    }
    for (const edge of edges) {
      if (edge.fromId !== node.id) continue
      const child = nodes.find((n) => n.id === edge.toId)
      if (child) visit(child, T_forChildren, worldQuat, cumulativeFactors, symRot, symTransForChildren, prismCount)
    }
  }

  const identityT = new THREE.Matrix4()      // world frame
  const identityQ = new THREE.Quaternion()   // identity rotation

  for (const root of rootNodes) {
    visit(root, identityT, identityQ, [], SYM_IDENTITY, SYM_ZERO_VEC3, 0)
  }

  return result
}

// ─── Jacobian computation ──────────────────────────────────────────────────────

/**
 * One column of the 6×n geometric Jacobian (body-frame independent formulation).
 *
 * For revolute joint i:
 *   Jv = z_{i-1} × (p_e − p_i)   (linear velocity part)
 *   Jw = z_{i-1}                  (angular velocity part)
 *
 * For prismatic joint i:
 *   Jv = z_{i-1}
 *   Jw = [0, 0, 0]
 *
 * where z_{i-1} is the joint axis expressed in world frame (= localAxis rotated
 * by parentWorldQuaternion) and p_i is the world origin of the joint's output frame.
 */
export interface JacobianColumn {
  jointId: string
  kind: 'revolute' | 'prismatic'
  /** Linear velocity part of this column (world frame), m/s per unit q̇. */
  Jv: Vec3
  /** Angular velocity part of this column (world frame), rad/s per unit q̇. */
  Jw: Vec3
  /**
   * Symbolic world-frame axis [x, y, z] string, derived from the parent
   * frame's symbolicCumulativeRotation column corresponding to the joint axis.
   * null when the axis is not a pure cardinal direction.
   */
  symAxis: [string, string, string] | null
}

/**
 * Compute the geometric Jacobian for the given kinematic chain.
 * Only revolute and prismatic joints contribute columns.
 *
 * @param chain  Ordered frames root → last joint (EE frame NOT required to be included).
 * @param eePosition  World position of the end-effector.  Must be supplied
 *   explicitly so the function is not confused by whether the EE frame is
 *   the last entry or not.
 */
export function computeJacobian(chain: KinematicFrame[], eePosition: Vec3): JacobianColumn[] {
  if (chain.length === 0) return []
  const pe = eePosition
  const columns: JacobianColumn[] = []

  for (let idx = 0; idx < chain.length; idx++) {
    const frame = chain[idx]
    const { node } = frame
    if (node.kind !== 'revolute' && node.kind !== 'prismatic') continue

    // World-frame axis: local axis rotated by the parent frame's orientation
    const localAxis = new THREE.Vector3(...(node.axis ?? [0, 0, 1])).normalize()
    const zw = localAxis.clone().applyQuaternion(frame.parentWorldQuaternion)
    const z: Vec3 = [zw.x, zw.y, zw.z]

    let Jv: Vec3
    let Jw: Vec3
    if (node.kind === 'revolute') {
      const dp: Vec3 = [pe[0] - frame.worldPosition[0], pe[1] - frame.worldPosition[1], pe[2] - frame.worldPosition[2]]
      const cross = new THREE.Vector3(...z).cross(new THREE.Vector3(...dp))
      Jv = [cross.x, cross.y, cross.z]
      Jw = z
    } else {
      Jv = z
      Jw = [0, 0, 0]
    }

    // Symbolic axis: look up the corresponding column of the parent frame's
    // rotation matrix.  Only works for pure cardinal-axis joints.
    let symAxis: [string, string, string] | null = null
    const parentFrame = idx > 0 ? chain[idx - 1] : null
    const ax = node.axis ?? [0, 0, 1]
    const colIdx =
      ax[0] === 1 && ax[1] === 0 && ax[2] === 0 ? 0
      : ax[0] === 0 && ax[1] === 1 && ax[2] === 0 ? 1
      : ax[0] === 0 && ax[1] === 0 && ax[2] === 1 ? 2
      : -1

    if (colIdx >= 0) {
      const symRot = parentFrame
        ? parentFrame.symbolicCumulativeRotation   // 9-entry row-major 3×3
        : ['1', '0', '0', '0', '1', '0', '0', '0', '1'] // identity for root
      // Column colIdx in row-major → entries [0*3+colIdx, 1*3+colIdx, 2*3+colIdx]
      symAxis = [symRot[colIdx], symRot[3 + colIdx], symRot[6 + colIdx]]
    }

    columns.push({ jointId: node.id, kind: node.kind, Jv, Jw, symAxis })
  }

  return columns
}

// ─── Chain computation (for Transforms panel) ─────────────────────────────────

/**
 * Walk the kinematic chain from the root anchor, through selectedId, to the
 * end effector.  Uses precomputed frames from computeTransformFrames.
 *
 * Returns an ordered array of KinematicFrames:
 *   [root_anchor, ..., selected_joint, ..., end_effector]
 */
export function computeKinematicChain(
  selectedId: string,
  frames: Map<string, TransformFrame>,
  nodes: SceneNode[],
  edges: SceneEdge[],
): KinematicFrame[] {
  // ── 1. Walk backward from selected node to find the root ──────────────────
  const backChain: string[] = []
  const visited = new Set<string>()
  let current: string | null = selectedId

  while (current !== null) {
    if (visited.has(current)) break
    visited.add(current)
    backChain.unshift(current)

    const node = nodes.find((n) => n.id === current)
    if (!node) break
    if (node.isAnchor || !edges.some((e) => e.toId === current)) break

    const parentEdge = edges.find((e) => e.toId === current)
    current = parentEdge ? parentEdge.fromId : null
  }

  if (backChain.length === 0) return []

  // ── 2. Walk forward from selected node to the end effector ───────────────
  const forwardChain: string[] = []
  const fwdVisited = new Set<string>(backChain)
  let fwdCurrent: string | null = selectedId

  while (fwdCurrent !== null) {
    const fwdNode = nodes.find((n) => n.id === fwdCurrent)
    if (!fwdNode) break

    if (fwdCurrent !== selectedId) {
      if (fwdVisited.has(fwdCurrent)) break
      fwdVisited.add(fwdCurrent)
      forwardChain.push(fwdCurrent)
    }

    if (fwdNode.kind === 'end-effector') break
    const childEdge = edges.find((e) => e.fromId === fwdCurrent)
    fwdCurrent = childEdge ? childEdge.toId : null
  }

  const chainIds = [...backChain, ...forwardChain]

  // ── 3. Build KinematicFrames from precomputed TransformFrames ─────────────
  return chainIds.flatMap((id, i): KinematicFrame[] => {
    const frame = frames.get(id)
    if (!frame) return []

    // relativePosition: for root, the world position IS the "relative" position
    // (relative to implicit world origin).  For others, it is the stored local offset.
    const isRoot = !edges.some((e) => e.toId === id)
    const relativePosition: Vec3 = isRoot
      ? frame.worldPosition
      : (frame.node.position as Vec3)

    return [{
      ...frame,
      frameIndex: i,
      isSelected: id === selectedId,
      relativePosition,
    }]
  })
}
