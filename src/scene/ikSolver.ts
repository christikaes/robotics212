/**
 * ikSolver.ts — Iterative Jacobian-based inverse kinematics solver.
 *
 * Method: Damped Least Squares (Levenberg-Marquardt style)
 *
 *   Δq = Jᵀ (J Jᵀ + λ²I)⁻¹ Δx
 *
 * where:
 *   J    — 3×n linear velocity Jacobian (position only; we ignore orientation)
 *   λ    — damping factor (prevents near-singularity blow-up)
 *   Δx   — Cartesian error vector (target − current end-effector position)
 *   Δq   — joint variable update (radians for revolute, metres for prismatic)
 *
 * The solver iterates up to MAX_ITER times or until |Δx| < TOLERANCE.
 *
 * Supports revolute joints only for now (prismatic extension is straightforward
 * but not wired up in the scene graph yet).
 */

import * as THREE from 'three'
import type { SceneNode, SceneEdge, Vec3 } from './types'
import { computeTransformFrames } from './transformEngine'

// ── Solver constants ───────────────────────────────────────────────────────────

const MAX_ITER  = 100          // maximum Jacobian steps
const TOLERANCE = 1e-4         // convergence threshold (metres)
const DAMPING   = 0.05         // λ — trades accuracy for stability near singularities
const STEP_SIZE = 0.5          // α — step scale (keeps each update conservative)
const MAX_DELTA_RAD = 0.2      // clamp per-joint update per iteration (radians)

// ── Public API ─────────────────────────────────────────────────────────────────

export interface IKResult {
  /** Solved joint angles (degrees) keyed by node id.  Only revolute joints. */
  angles: Map<string, number>
  /** Final end-effector position after solve (metres). */
  achieved: Vec3
  /** Residual Cartesian error magnitude at termination (metres). */
  error: number
  /** Number of iterations taken. */
  iterations: number
  /** True if |error| < TOLERANCE at termination. */
  converged: boolean
}

/**
 * Solve IK for the kinematic chain ending at `endEffectorId`.
 *
 * @param targetPos  Desired world position for the end effector.
 * @param nodes      Current scene nodes (read-only).
 * @param edges      Current scene edges (read-only).
 * @param endEffectorId  Node id of the end-effector node.
 * @returns IKResult with solved joint angles and convergence metadata.
 */
export function solveIK(
  targetPos: Vec3,
  nodes: SceneNode[],
  edges: SceneEdge[],
  endEffectorId: string,
): IKResult {
  // Work on mutable copies so we can iterate without mutating React state.
  let workNodes: SceneNode[] = nodes.map((n) => ({ ...n }))

  // Find the chain: revolute joints from root to end-effector (BFS back-chain).
  const chainIds = buildChain(endEffectorId, workNodes, edges)
  const revoluteIds = chainIds.filter((id) => {
    const n = workNodes.find((x) => x.id === id)
    return n?.kind === 'revolute'
  })

  if (revoluteIds.length === 0) {
    // Nothing to solve — report current state.
    const frames = computeTransformFrames(workNodes, edges)
    const ee = frames.get(endEffectorId)
    const achieved: Vec3 = ee?.worldPosition ?? [0, 0, 0]
    const err = dist(achieved, targetPos)
    return { angles: new Map(), achieved, error: err, iterations: 0, converged: err < TOLERANCE }
  }

  let iter = 0
  let error = Infinity

  while (iter < MAX_ITER) {
    const frames = computeTransformFrames(workNodes, edges)
    const eeFrame = frames.get(endEffectorId)
    if (!eeFrame) break

    const pe = eeFrame.worldPosition
    const dx: [number, number, number] = [
      targetPos[0] - pe[0],
      targetPos[1] - pe[1],
      targetPos[2] - pe[2],
    ]
    error = Math.sqrt(dx[0] ** 2 + dx[1] ** 2 + dx[2] ** 2)
    if (error < TOLERANCE) break

    // ── Build 3×n Jacobian (linear velocity rows only) ──────────────────────
    // J[row][col]: row ∈ {0,1,2} = x/y/z; col ∈ 0..n-1 = revolute joints
    const n = revoluteIds.length
    const J: number[][] = [
      new Array(n).fill(0),
      new Array(n).fill(0),
      new Array(n).fill(0),
    ]

    for (let col = 0; col < n; col++) {
      const id = revoluteIds[col]
      const frame = frames.get(id)
      if (!frame) continue

      const node = workNodes.find((x) => x.id === id)!
      const localAxis = new THREE.Vector3(...(node.axis ?? [0, 0, 1])).normalize()
      const zw = localAxis.clone().applyQuaternion(frame.parentWorldQuaternion)

      // Jv = z × (pe − pi)
      const pi = frame.worldPosition
      const dp = new THREE.Vector3(pe[0] - pi[0], pe[1] - pi[1], pe[2] - pi[2])
      const jv = zw.clone().cross(dp)

      J[0][col] = jv.x
      J[1][col] = jv.y
      J[2][col] = jv.z
    }

    // ── Damped least squares: Δq = Jᵀ(JJᵀ + λ²I)⁻¹ Δx ─────────────────────
    // For 3×n J: JJᵀ is 3×3, easy to invert directly.
    const λ2 = DAMPING * DAMPING

    // A = J Jᵀ + λ²I  (3×3)
    const A = mat3Add(matMul3xN_Nx3(J, n), mat3Scale(identity3(), λ2))

    // A_inv = inverse of 3×3 A
    const Ainv = invert3x3(A)
    if (!Ainv) break // singular — give up

    // v = A_inv × Δx  (3-vector)
    const v = mat3VecMul(Ainv, dx)

    // Δq = STEP_SIZE * Jᵀ × v  (n-vector)
    const dq = new Array<number>(n).fill(0)
    for (let col = 0; col < n; col++) {
      let sum = 0
      for (let row = 0; row < 3; row++) sum += J[row][col] * v[row]
      dq[col] = STEP_SIZE * sum
      // Clamp to avoid instability
      dq[col] = Math.max(-MAX_DELTA_RAD, Math.min(MAX_DELTA_RAD, dq[col]))
    }

    // ── Apply Δq ─────────────────────────────────────────────────────────────
    workNodes = workNodes.map((n) => {
      const col = revoluteIds.indexOf(n.id)
      if (col < 0) return n
      const oldRad = ((n.angle ?? 0) * Math.PI) / 180
      const newRad = oldRad + dq[col]
      const newDeg = (newRad * 180) / Math.PI
      return { ...n, angle: newDeg }
    })

    iter++
  }

  // Recompute final achieved position
  const finalFrames = computeTransformFrames(workNodes, edges)
  const eeFrame = finalFrames.get(endEffectorId)
  const achieved: Vec3 = eeFrame?.worldPosition ?? [0, 0, 0]
  error = dist(achieved, targetPos)

  const angles = new Map<string, number>()
  for (const id of revoluteIds) {
    const node = workNodes.find((n) => n.id === id)
    if (node) angles.set(id, node.angle ?? 0)
  }

  return { angles, achieved, error, iterations: iter, converged: error < TOLERANCE }
}

// ── Chain walking ──────────────────────────────────────────────────────────────

function buildChain(endId: string, nodes: SceneNode[], edges: SceneEdge[]): string[] {
  const chain: string[] = []
  const visited = new Set<string>()
  let current: string | null = endId

  while (current !== null) {
    if (visited.has(current)) break
    visited.add(current)
    chain.unshift(current)

    const node = nodes.find((n) => n.id === current)
    if (!node) break
    if (node.isAnchor || !edges.some((e) => e.toId === current)) break

    const parentEdge = edges.find((e) => e.toId === current)
    current = parentEdge ? parentEdge.fromId : null
  }

  return chain
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function dist(a: Vec3, b: Vec3): number {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2)
}

type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number,
]

function identity3(): Mat3 {
  return [1,0,0, 0,1,0, 0,0,1]
}

function mat3Scale(m: Mat3, s: number): Mat3 {
  return m.map((v) => v * s) as Mat3
}

function mat3Add(a: Mat3, b: Mat3): Mat3 {
  return a.map((v, i) => v + b[i]) as Mat3
}

/** Compute J × Jᵀ where J is 3×n (stored as J[row][col]). Result is 3×3. */
function matMul3xN_Nx3(J: number[][], n: number): Mat3 {
  const out: Mat3 = [0,0,0, 0,0,0, 0,0,0]
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0
      for (let k = 0; k < n; k++) sum += J[r][k] * J[c][k]
      out[r * 3 + c] = sum
    }
  }
  return out
}

function mat3VecMul(m: Mat3, v: [number,number,number]): [number,number,number] {
  return [
    m[0]*v[0] + m[1]*v[1] + m[2]*v[2],
    m[3]*v[0] + m[4]*v[1] + m[5]*v[2],
    m[6]*v[0] + m[7]*v[1] + m[8]*v[2],
  ]
}

function invert3x3(m: Mat3): Mat3 | null {
  const [a,b,c, d,e,f, g,h,i] = m
  const det = a*(e*i - f*h) - b*(d*i - f*g) + c*(d*h - e*g)
  if (Math.abs(det) < 1e-12) return null
  const inv = 1 / det
  return [
     (e*i-f*h)*inv, -(b*i-c*h)*inv,  (b*f-c*e)*inv,
    -(d*i-f*g)*inv,  (a*i-c*g)*inv, -(a*f-c*d)*inv,
     (d*h-e*g)*inv, -(a*h-b*g)*inv,  (a*e-b*d)*inv,
  ]
}
