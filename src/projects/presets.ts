/**
 * Preset robot configurations drawn from MIT 2.12/2.120 Robotics homework
 * and exam problems.
 *
 * Each preset encodes a complete SceneNode[] + SceneEdge[] snapshot.
 * IDs use stable string prefixes (e.g. "ps3rr-j1") so they never clash
 * with the generated IDs emitted by SceneContext (e.g. "revolute-3").
 */

import type { SceneNode, SceneEdge } from '../scene/types'

export interface ProjectPreset {
  id: string
  name: string
  /** Short abbreviation shown as a badge (e.g. "RR", "RRR", "RP"). */
  badge: string
  /** Where this configuration appears in the course materials. */
  source: string
  description: string
  nodes: SceneNode[]
  edges: SceneEdge[]
}

// ─── 1. 2-DOF Planar RR Arm (PS#3, PS#5) ────────────────────────────────────
const planarRR: ProjectPreset = {
  id: 'planar-rr',
  name: '2-DOF Planar RR Arm',
  badge: 'RR',
  source: 'PS#3, PS#5',
  description:
    'Two revolute joints in the vertical xy-plane. Classic planar serial manipulator for Jacobian and workspace analysis.',
  nodes: [
    {
      id: 'ps3rr-j1',
      kind: 'revolute',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      isAnchor: true,
      axis: [0, 0, 1],
      angle: 30,
    },
    {
      id: 'ps3rr-j2',
      kind: 'revolute',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      axis: [0, 0, 1],
      angle: 45,
    },
    {
      id: 'ps3rr-ee',
      kind: 'end-effector',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
    },
  ],
  edges: [
    { id: 'ps3rr-l1', kind: 'link', fromId: 'ps3rr-j1', toId: 'ps3rr-j2', length: 2 },
    { id: 'ps3rr-l2', kind: 'link', fromId: 'ps3rr-j2', toId: 'ps3rr-ee', length: 2 },
  ],
}

// ─── 2. 3-DOF Planar RRR Arm (PS#4) ─────────────────────────────────────────
// Link lengths all 2 m.
const planarRRR: ProjectPreset = {
  id: 'planar-rrr',
  name: '3-DOF Planar RRR Arm',
  badge: 'RRR',
  source: 'PS#4',
  description:
    'Three revolute joints in the xy-plane with link lengths ℓ₁=ℓ₂=ℓ₃=2 m. Used for FK, IK, and dynamics problems.',
  nodes: [
    {
      id: 'ps4rrr-j1',
      kind: 'revolute',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      isAnchor: true,
      axis: [0, 0, 1],
      angle: 30,
    },
    {
      id: 'ps4rrr-j2',
      kind: 'revolute',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      axis: [0, 0, 1],
      angle: 45,
    },
    {
      id: 'ps4rrr-j3',
      kind: 'revolute',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      axis: [0, 0, 1],
      angle: -30,
    },
    {
      id: 'ps4rrr-ee',
      kind: 'end-effector',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
    },
  ],
  edges: [
    { id: 'ps4rrr-l1', kind: 'link', fromId: 'ps4rrr-j1', toId: 'ps4rrr-j2', length: 2 },
    { id: 'ps4rrr-l2', kind: 'link', fromId: 'ps4rrr-j2', toId: 'ps4rrr-j3', length: 2 },
    { id: 'ps4rrr-l3', kind: 'link', fromId: 'ps4rrr-j3', toId: 'ps4rrr-ee', length: 2 },
  ],
}

// ─── 3. 2-DOF R-P Arm (PS#5) ─────────────────────────────────────────────────
// Joint 1: revolute about z. Joint 2: prismatic, slides along arm axis.
const rpArm: ProjectPreset = {
  id: 'rp-arm',
  name: '2-DOF R-P Arm',
  badge: 'RP',
  source: 'PS#5',
  description:
    'Revolute base joint followed by a prismatic sliding joint. Used for dynamics derivations and control exercises.',
  nodes: [
    {
      id: 'ps5rp-j1',
      kind: 'revolute',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      isAnchor: true,
      axis: [0, 0, 1],
      angle: 45,
    },
    {
      id: 'ps5rp-j2',
      kind: 'prismatic',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      extension: 0.5,
    },
    {
      id: 'ps5rp-ee',
      kind: 'end-effector',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
    },
  ],
  edges: [
    { id: 'ps5rp-l1', kind: 'link', fromId: 'ps5rp-j1', toId: 'ps5rp-j2', length: 2 },
    { id: 'ps5rp-l2', kind: 'link', fromId: 'ps5rp-j2', toId: 'ps5rp-ee', length: 2 },
  ],
}

// ─── 4. 3-DOF Spherical Arm — RRP (1st Exam, Prob 2) ─────────────────────────
// Joint 1: revolute about vertical y-axis (yaw).
// Joint 2: revolute about horizontal z-axis (pitch/elevation).
// Joint 3: prismatic (radial reach), offset from joint 2.
const rrpArm: ProjectPreset = {
  id: 'rrp-arm',
  name: '3-DOF Spherical Arm (RRP)',
  badge: 'RRP',
  source: '1st Exam, Prob 2',
  description:
    'Yaw–pitch–extend configuration. Revolute about vertical axis, revolute about horizontal axis, then prismatic radial extension.',
  nodes: [
    {
      id: 'ex1rrp-j1',
      kind: 'revolute',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      isAnchor: true,
      axis: [0, 1, 0],
      angle: 45,
    },
    {
      id: 'ex1rrp-j2',
      kind: 'revolute',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      axis: [0, 0, 1],
      angle: 30,
    },
    {
      id: 'ex1rrp-j3',
      kind: 'prismatic',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      extension: 0.5,
    },
    {
      id: 'ex1rrp-ee',
      kind: 'end-effector',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
    },
  ],
  edges: [
    { id: 'ex1rrp-l1', kind: 'link', fromId: 'ex1rrp-j1', toId: 'ex1rrp-j2', length: 2 },
    { id: 'ex1rrp-l2', kind: 'link', fromId: 'ex1rrp-j2', toId: 'ex1rrp-j3', length: 2 },
    { id: 'ex1rrp-l3', kind: 'link', fromId: 'ex1rrp-j3', toId: 'ex1rrp-ee', length: 2 },
  ],
}

// ─── 5. 3-DOF Ceiling-Mounted Arm (2nd Exam, Prob 3) ─────────────────────────
// Joint 1: revolute about y (yaw sweep). Joints 2 & 3: revolute about z
// (pitch). Link lengths all 2 m.
const ceilingArm: ProjectPreset = {
  id: 'ceiling-rrr',
  name: '3-DOF Ceiling-Mounted Arm',
  badge: 'RRR',
  source: '2nd Exam, Prob 3',
  description:
    'Three-link arm fixed to ceiling. Yaw at base, two pitch joints. Used for FK, singularity, and Jacobian analysis in 3D.',
  nodes: [
    {
      id: 'ex2ceil-j1',
      kind: 'revolute',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      isAnchor: true,
      axis: [0, 1, 0],
      angle: 45,
    },
    {
      id: 'ex2ceil-j2',
      kind: 'revolute',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      axis: [0, 0, 1],
      angle: 30,
    },
    {
      id: 'ex2ceil-j3',
      kind: 'revolute',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      axis: [0, 0, 1],
      angle: -45,
    },
    {
      id: 'ex2ceil-ee',
      kind: 'end-effector',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
    },
  ],
  edges: [
    { id: 'ex2ceil-l1', kind: 'link', fromId: 'ex2ceil-j1', toId: 'ex2ceil-j2', length: 2 },
    { id: 'ex2ceil-l2', kind: 'link', fromId: 'ex2ceil-j2', toId: 'ex2ceil-j3', length: 2 },
    { id: 'ex2ceil-l3', kind: 'link', fromId: 'ex2ceil-j3', toId: 'ex2ceil-ee', length: 2 },
  ],
}

// ─── 6. Acrobat Robot — Hanging RR Pendulum (PS#5, PS#6) ─────────────────────
// Arm suspended from a fixed horizontal bar at y=1. Both joints rotate about
// the z-axis; links hang downward from the attachment point.
const acrobotRR: ProjectPreset = {
  id: 'acrobat-rr',
  name: 'Acrobat Robot (RR Pendulum)',
  badge: 'RR',
  source: 'PS#5, PS#6',
  description:
    'Under-actuated double pendulum hanging from a fixed bar. Joint 2 is passive (τ₂=0). Used for nonlinear dynamics and swing-up control.',
  nodes: [
    {
      id: 'ps6acro-j1',
      kind: 'revolute',
      position: [0, 1, 0],
      rotation: [0, 0, 0],
      isAnchor: true,
      axis: [0, 0, 1],
      angle: 20,
    },
    {
      id: 'ps6acro-j2',
      kind: 'revolute',
      // 2 m below j1 in j1's local frame (hangs down from the bar)
      position: [0, -2, 0],
      rotation: [0, 0, 0],
      axis: [0, 0, 1],
      angle: -30,
    },
    {
      id: 'ps6acro-ee',
      kind: 'end-effector',
      position: [0, -2, 0],
      rotation: [0, 0, 0],
    },
  ],
  edges: [
    { id: 'ps6acro-l1', kind: 'link', fromId: 'ps6acro-j1', toId: 'ps6acro-j2', length: 2 },
    { id: 'ps6acro-l2', kind: 'link', fromId: 'ps6acro-j2', toId: 'ps6acro-ee', length: 2 },
  ],
}

// ─── 7. Delta Robot — Parallel 3-Arm Mechanism ───────────────────────────────
// 3 anchors at 120° spacing, each with 2 revolute joints (RR upper arm).
// All three second revolute joints (j2) connect via lower links to a single
// shared end-effector at the platform centre.
//
// Because the scene graph is a tree, the end-effector is defined as a
// free-standing root node at a fixed world position. The three lower links
// (j2 → ee) render correctly because LinkEdgeMesh uses world positions from
// the frames map regardless of parent/child direction.
//
// Arm layout (top view, +y up, base circle r=1):
//   Arm A — anchor ( 1,    0,  0    ), axes tangent to circle
//   Arm B — anchor (-0.5,  0,  0.866)
//   Arm C — anchor (-0.5,  0, -0.866)
const deltaRobot: ProjectPreset = {
  id: 'delta-robot',
  name: 'Delta Robot (Parallel 3-Arm)',
  badge: 'Δ',
  source: 'Lab / Lecture',
  description:
    'Ceiling-mounted parallel delta robot. Three RR arms (two revolute joints each) hang from anchors spaced 120° apart; all three lower arms meet at a single shared end-effector platform.',
  nodes: [
    // ── Shared end-effector (free-standing root at platform centre) ─────────
    {
      id: 'delta-ee',
      kind: 'end-effector',
      position: [0, -4, 0],   // world position: 4 m below the base plane
      rotation: [0, 0, 0],
    },

    // ── Arm A ──────────────────────────────────────────────────────────────
    {
      id: 'delta-a-j1',
      kind: 'revolute',
      position: [1, 0, 0],    // world position (anchor root)
      rotation: [0, 0, 0],
      isAnchor: true,
      axis: [0, 0, 1],        // tangential to base circle at 0°
      angle: 30,
    },
    {
      id: 'delta-a-j2',
      kind: 'revolute',
      position: [0, -2, 0],   // 2 m below j1 in j1's local frame
      rotation: [0, 0, 0],
      axis: [0, 0, 1],
      angle: -15,
    },

    // ── Arm B ──────────────────────────────────────────────────────────────
    {
      id: 'delta-b-j1',
      kind: 'revolute',
      position: [-0.5, 0, 0.866],
      rotation: [0, 0, 0],
      isAnchor: true,
      axis: [-0.866, 0, 0.5], // tangential at 120°
      angle: 30,
    },
    {
      id: 'delta-b-j2',
      kind: 'revolute',
      position: [0, -2, 0],
      rotation: [0, 0, 0],
      axis: [-0.866, 0, 0.5],
      angle: -15,
    },

    // ── Arm C ──────────────────────────────────────────────────────────────
    {
      id: 'delta-c-j1',
      kind: 'revolute',
      position: [-0.5, 0, -0.866],
      rotation: [0, 0, 0],
      isAnchor: true,
      axis: [0.866, 0, 0.5],  // tangential at 240°
      angle: 30,
    },
    {
      id: 'delta-c-j2',
      kind: 'revolute',
      position: [0, -2, 0],
      rotation: [0, 0, 0],
      axis: [0.866, 0, 0.5],
      angle: -15,
    },
  ],
  edges: [
    // Upper arms: anchor → j2
    { id: 'delta-a-l1', kind: 'link', fromId: 'delta-a-j1', toId: 'delta-a-j2', length: 2 },
    { id: 'delta-b-l1', kind: 'link', fromId: 'delta-b-j1', toId: 'delta-b-j2', length: 2 },
    { id: 'delta-c-l1', kind: 'link', fromId: 'delta-c-j1', toId: 'delta-c-j2', length: 2 },
    // Lower arms: all three j2s → shared end-effector
    { id: 'delta-a-l2', kind: 'link', fromId: 'delta-a-j2', toId: 'delta-ee',   length: 2 },
    { id: 'delta-b-l2', kind: 'link', fromId: 'delta-b-j2', toId: 'delta-ee',   length: 2 },
    { id: 'delta-c-l2', kind: 'link', fromId: 'delta-c-j2', toId: 'delta-ee',   length: 2 },
  ],
}

/** Ensure all revolute/prismatic joints in a preset have actuated:true by default. */
function withActuatedDefaults(preset: ProjectPreset): ProjectPreset {
  return {
    ...preset,
    nodes: preset.nodes.map((n) =>
      (n.kind === 'revolute' || n.kind === 'prismatic') && n.actuated === undefined
        ? { ...n, actuated: true }
        : n,
    ),
  }
}

// ─── 8. Parallel Crank — Two Anchors, Shared EE ─────────────────────────────
//
// Two revolute anchors J1 (active) and J2 (passive) are both connected to a
// single shared end-effector EE.  This forms a four-bar-like closed loop.
//
// The EE is a FREE-STANDING root node (world-position semantics).  Both J1
// and J2 have outgoing edges to it.  The constraint solver in SceneContext
// intersects the two circles (circle1: center=J1, r=L1; circle2: center=J2,
// r=L2) to place the EE at the correct world position whenever J1's angle
// changes, then back-solves J2's display angle.
//
// Geometry at initial configuration:
//   J1 at world [0, 0, 0], initial angle = 53.13°, link = 2.5
//     → EE at J1 + [1.5, 2, 0] = [1.5, 2, 0]
//   J2 at world [3, 0, 0], link = 2.5
//     → EE also at [1.5, 2, 0]  (|[1.5-3, 2, 0]| = 2.5 ✓)
//
// J1 initial angle: atan2(2, 1.5) ≈ 53.13°
// J2 initial angle: atan2(2, 1.5-3) = atan2(2, -1.5) ≈ 126.87°
const parallelCrank: ProjectPreset = {
  id: 'parallel-crank',
  name: 'Parallel Crank (Two Anchors)',
  badge: 'PC',
  source: 'Parallel Mechanisms',
  description:
    'Two anchored revolute joints (J1 active, J2 passive) connected to a shared end-effector. ' +
    'Changing J1\'s angle moves the EE; the constraint solver keeps both link lengths fixed ' +
    'by computing the circle-circle intersection and auto-updating J2\'s angle.',
  nodes: [
    // EE is a FREE-STANDING root: world position, no parent edge.
    // The constraint solver updates its position on every J1 angle change.
    {
      id: 'pc-ee',
      kind: 'end-effector',
      position: [1.5, 2, 0],   // world position (intersection of the two circles)
      rotation: [0, 0, 0],
    },
    {
      id: 'pc-j1',
      kind: 'revolute',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      isAnchor: true,
      axis: [0, 0, 1],
      // atan2(2, 1.5) ≈ 53.13°  →  J1 points from (0,0,0) toward (1.5,2,0)
      angle: Math.round(Math.atan2(2, 1.5) * 180 / Math.PI * 100) / 100,
      actuated: true,
    },
    {
      id: 'pc-j2',
      kind: 'revolute',
      position: [3, 0, 0],
      rotation: [0, 0, 0],
      isAnchor: true,
      axis: [0, 0, 1],
      // atan2(2, -1.5) ≈ 126.87°  →  J2 points from (3,0,0) toward (1.5,2,0)
      angle: Math.round(Math.atan2(2, -1.5) * 180 / Math.PI * 100) / 100,
      actuated: false,
    },
  ],
  edges: [
    // Both joints have outgoing edges to the shared EE.
    { id: 'pc-l1', kind: 'link', fromId: 'pc-j1', toId: 'pc-ee', length: 2.5 },
    { id: 'pc-l2', kind: 'link', fromId: 'pc-j2', toId: 'pc-ee', length: 2.5 },
  ],
}

export const PRESETS: ProjectPreset[] = [
  planarRR,
  planarRRR,
  rpArm,
  rrpArm,
  ceilingArm,
  acrobotRR,
  deltaRobot,
  parallelCrank,
].map(withActuatedDefaults)
