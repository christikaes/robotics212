/**
 * Scene graph types.
 *
 * The robot is a graph:
 *   - Nodes are joints (rigid frames in space). Any joint can be pinned to
 *     the world frame by setting isAnchor = true.
 *   - Edges are links (rigid bars connecting two nodes).
 *
 * Joint kinds:
 *   revolute    — rotates around an axis (1 DOF)
 *   prismatic   — translates along an axis (1 DOF)
 *   spherical   — free rotation (3 DOF, ball-and-socket)
 *   end-effector — terminal frame; no outgoing links allowed
 */

export type Vec3 = [number, number, number]

export type NodeKind = 'revolute' | 'prismatic' | 'spherical' | 'end-effector'

/** All node kinds are joints now; JointKind is an alias. */
export type JointKind = NodeKind

/** What the user is currently trying to add. 'link' is an edge operation. */
export type PendingKind = NodeKind | 'link'

export interface SceneNode {
  id: string
  kind: NodeKind
  position: Vec3
  rotation: Vec3 // radians (world-space orientation)
  /** If true, this joint is pinned to world coordinates (acts as a fixed base). */
  isAnchor?: boolean
  /** Revolute joint: unit-vector axis of rotation in local frame. Default [0,0,1]. */
  axis?: Vec3
  /** Revolute joint: current joint angle in degrees. */
  angle?: number
  /** Prismatic joint: current linear extension in metres. */
  extension?: number
  /**
   * Joint velocity: degrees/s for revolute, metres/s for prismatic.
   * Stored as the rate of change of the primary joint variable (q̇).
   */
  velocity?: number
  /**
   * Joint acceleration: degrees/s² for revolute, metres/s² for prismatic.
   * Stored as the second derivative of the primary joint variable (q̈).
   */
  acceleration?: number
  /**
   * Whether this joint is actively driven by a motor / actuator.
   * false (or undefined) → passive (spring, gravity, free).
   * Only meaningful for joints with DOF: revolute, prismatic, spherical.
   */
  actuated?: boolean
}

export interface SceneEdge {
  id: string
  kind: 'link'
  fromId: string
  toId: string
  /** Fixed length of this link in metres. */
  length: number
}

export type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | null

export const NODE_LABEL: Record<NodeKind, string> = {
  revolute: 'Revolute Joint',
  prismatic: 'Prismatic Joint',
  spherical: 'Spherical Joint',
  'end-effector': 'End Effector',
}

export const PENDING_LABEL: Record<PendingKind, string> = {
  revolute: 'Revolute Joint',
  prismatic: 'Prismatic Joint',
  spherical: 'Spherical Joint',
  'end-effector': 'End Effector',
  link: 'Link',
}
