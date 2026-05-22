/**
 * KinematicsPanel — Forward kinematics for the full chain:
 *   root anchor → selected joint → end effector.
 *
 * Each joint card shows:
 *   Aᵢ  = [R | p ; 0 1]  — local transform (relative to parent frame)
 *   T₀ᵢ = A₀ × ... × Aᵢ — cumulative world transform
 *
 * A Jacobian section at the bottom shows the geometric Jacobian J:
 *   ẋ = J · q̇   (6×n, top 3 rows = linear, bottom 3 = angular)
 *
 * Based on the Asada (MIT 2.12/2.120) formulation:
 *   Lecture 5 — Consecutive Coordinate Transformation
 *   Lecture 6 — Homogeneous Transformation, D-H Notation
 *   Lecture 7 — Jacobian
 */

import { useMemo, useState } from 'react'
import { PanelShell } from './PanelShell'
import { useScene } from '../scene/SceneContext'
import { computeKinematicChain, computeJacobian } from '../scene/transformEngine'
import type { KinematicFrame, JacobianColumn } from '../scene/transformEngine'
import type { NodeKind } from '../scene/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  return parseFloat(v.toFixed(4)).toString()
}

function fmt3(v: number): string {
  return parseFloat(v.toFixed(3)).toString()
}

/** Round to nearest 0.1 for display in numeric mode */
function fmtNum(v: number): string {
  return parseFloat(v.toFixed(1)).toString()
}

/**
 * Symbolically render an A-matrix rotation cell.
 * Falls back to numeric if the value doesn't match cos/sin of the joint angle.
 */
function fmtSym(
  val: number,
  angleDeg: number | null,
  varLabel: string,
  eps = 5e-4,
): string {
  const near = (a: number, b: number) => Math.abs(a - b) < eps
  if (near(val,  0)) return '0'
  if (near(val,  1)) return '1'
  if (near(val, -1)) return '-1'
  if (angleDeg !== null) {
    const rad = (angleDeg * Math.PI) / 180
    const c = Math.cos(rad), s = Math.sin(rad)
    if (near(val,  c)) return `c${varLabel}`
    if (near(val, -c)) return `-c${varLabel}`
    if (near(val,  s)) return `s${varLabel}`
    if (near(val, -s)) return `-s${varLabel}`
  }
  return fmt(val)
}

const KIND_LABEL: Record<NodeKind, string> = {
  revolute: 'Revolute',
  prismatic: 'Prismatic',
  spherical: 'Spherical',
  'end-effector': 'End Effector',
}

const KIND_CLASS: Record<NodeKind, string> = {
  revolute: 'kin-badge-revolute',
  prismatic: 'kin-badge-prismatic',
  spherical: 'kin-badge-spherical',
  'end-effector': 'kin-badge-effector',
}

function sub(n: number): string {
  const SUBS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉']
  return String(n).split('').map((c) => SUBS[parseInt(c)] ?? c).join('')
}

// ─── 4×4 matrix display ───────────────────────────────────────────────────────

function MatrixDisplay({
  matrix,
  colHeaders,
  translationCol = 3,
  angleDeg = null,
  varLabel = 'θ',
  symbolicRotation,
  symbolicTranslation,
  numeric = false,
}: {
  matrix: number[]
  colHeaders: [string, string, string, string]
  translationCol?: number
  angleDeg?: number | null
  varLabel?: string
  symbolicRotation?: string[]
  symbolicTranslation?: string[]
  numeric?: boolean
}) {
  const rows = [0, 1, 2, 3]
  const cols = [0, 1, 2, 3]

  return (
    <div className="kin-matrix-grid">
      <div className="kin-matrix-cell kin-matrix-header" />
      {colHeaders.map((h, ci) => (
        <div
          key={h}
          className={[
            'kin-matrix-cell kin-matrix-header',
            ci === translationCol ? 'kin-matrix-header-pos' : '',
          ].join(' ').trim()}
        >
          {h}
        </div>
      ))}
      {rows.map((r) => (
        <>
          <div key={`rh-${r}`} className="kin-matrix-cell kin-matrix-header">
            {r < 3 ? ['x', 'y', 'z'][r] : '—'}
          </div>
          {cols.map((c) => {
            const val = matrix[r * 4 + c]
            const isPos = c === translationCol && r < 3
            const isBottom = r === 3
            const isRotationCell = !isPos && !isBottom
            const cellText = numeric
              ? fmtNum(val)
              : isRotationCell
                ? symbolicRotation
                  ? symbolicRotation[r * 3 + c]
                  : fmtSym(val, angleDeg, varLabel)
                : isPos
                  ? symbolicTranslation
                    ? symbolicTranslation[r]
                    : fmt(val)
                  : fmt(val)
            return (
              <div
                key={`${r}-${c}`}
                className={[
                  'kin-matrix-cell',
                  isPos ? 'kin-matrix-translation' : '',
                  isBottom ? 'kin-matrix-bottom' : '',
                ].filter(Boolean).join(' ')}
              >
                {cellText}
              </div>
            )
          })}
        </>
      ))}
    </div>
  )
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function CollapsibleMatrix({
  matrixType,
  label,
  sublabel,
  children,
  defaultOpen = true,
}: {
  matrixType: 'A' | 'T' | 'J'
  label: string
  sublabel?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="kin-collapsible">
      <button
        className={`kin-collapse-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`kin-matrix-type-badge kin-matrix-type-${matrixType.toLowerCase()}`}>
          {matrixType}
        </span>
        <span className="kin-collapse-arrow">{open ? '▾' : '▸'}</span>
        <span className="kin-collapse-label">{label}</span>
        {sublabel && <span className="kin-collapse-sublabel">{sublabel}</span>}
      </button>
      {open && <div className="kin-matrix-wrap">{children}</div>}
    </div>
  )
}

// ─── Jacobian display ─────────────────────────────────────────────────────────

/**
 * Renders the 6×n Jacobian as a labelled grid.
 * Top 3 rows = linear velocity (Jv), bottom 3 = angular velocity (Jω).
 * Each column corresponds to one joint DOF.
 * Symbolic axis entries are shown for ω rows when available.
 */
function JacobianDisplay({ columns }: { columns: JacobianColumn[] }) {
  if (columns.length === 0) {
    return <p className="sidebar-empty kin-empty" style={{ padding: '8px 12px' }}>No active joints in chain.</p>
  }

  // Row labels: vx vy vz ωx ωy ωz
  const rowLabels = ['vₓ', 'vy', 'vz', 'ωₓ', 'ωy', 'ωz']

  return (
    <div className="kin-jacobian-grid" style={{ gridTemplateColumns: `auto repeat(${columns.length}, 1fr)` }}>
      {/* Corner */}
      <div className="kin-matrix-cell kin-matrix-header" />
      {/* Column headers: q̇₁, q̇₂, … */}
      {columns.map((col, ci) => (
        <div key={col.jointId} className="kin-matrix-cell kin-matrix-header">
          {columns.length === 1 ? 'q̇' : `q̇${sub(ci + 1)}`}
          <span className="kin-jac-kind">{col.kind === 'revolute' ? 'R' : 'P'}</span>
        </div>
      ))}
      {/* Rows */}
      {rowLabels.map((rowLabel, ri) => {
        const isAngular = ri >= 3
        const isTopDivider = ri === 3
        return (
          <>
            <div
              key={`rh-${ri}`}
              className={`kin-matrix-cell kin-matrix-header${isTopDivider ? ' kin-jac-divider' : ''}`}
            >
              {rowLabel}
            </div>
            {columns.map((col, ci) => {
              const numVal = isAngular ? col.Jw[ri - 3] : col.Jv[ri]
              // Symbolic: for angular rows, show the symAxis if available
              const symStr = isAngular && col.symAxis
                ? col.symAxis[ri - 3]
                : null
              const display = symStr ?? fmt3(numVal)
              const isEmpty = Math.abs(numVal) < 1e-9 && !symStr
              return (
                <div
                  key={`${ri}-${ci}`}
                  className={[
                    'kin-matrix-cell',
                    isAngular ? 'kin-jac-angular' : '',
                    isTopDivider ? 'kin-jac-divider' : '',
                    isEmpty ? 'kin-jac-zero' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {display}
                </div>
              )
            })}
          </>
        )
      })}
    </div>
  )
}

// ─── Per-frame card ───────────────────────────────────────────────────────────

function FrameCard({ frame, numeric = false }: { frame: KinematicFrame; numeric?: boolean }) {
  const { node, frameIndex, isSelected, aMatrix, cumulativeMatrix } = frame
  const isRoot = frameIndex === 0

  const aLabel  = isRoot ? 'A₀' : `A${sub(frameIndex)}`
  const tLabel  = `T₀${sub(frameIndex)}`

  // Primary joint variable label (q, q̇, q̈)
  const isRevolute  = node.kind === 'revolute'
  const isPrismatic = node.kind === 'prismatic'
  const qVal  = isRevolute  ? `${fmt(node.angle ?? 0)}°`
              : isPrismatic ? `${fmt(node.extension ?? 0)} m` : null
  const qdVal = (isRevolute || isPrismatic) && (node.velocity ?? 0) !== 0
    ? `${fmt(node.velocity ?? 0)}${isRevolute ? ' °/s' : ' m/s'}`
    : null
  const qddVal = (isRevolute || isPrismatic) && (node.acceleration ?? 0) !== 0
    ? `${fmt(node.acceleration ?? 0)}${isRevolute ? ' °/s²' : ' m/s²'}`
    : null

  // Symbolic rendering params for the A-matrix rotation block
  const symAngle = isRevolute  ? (node.angle ?? 0) : null
  const symVar   = isRevolute  ? 'θ'
                 : isPrismatic ? 'd' : 'θ'

  return (
    <div className={`kin-frame${isSelected ? ' kin-frame-selected' : ''}`}>
      {/* Header */}
      <div className="kin-frame-header">
        <span className="kin-frame-index">O{sub(frameIndex)}</span>
        {isRoot
          ? <span className="kin-badge kin-badge-anchor">Anchor</span>
          : <span className={`kin-badge ${KIND_CLASS[node.kind]}`}>{KIND_LABEL[node.kind]}</span>
        }
        <span className="kin-frame-id">{node.id}</span>
        {isSelected && <span className="kin-badge kin-badge-selected">selected</span>}
      </div>

      {/* Joint state: q, q̇, q̈ */}
      {(qVal || qdVal || qddVal) && (
        <div className="kin-joint-state">
          {qVal   && <span className="kin-state-item"><span className="kin-state-var">q</span>{qVal}</span>}
          {qdVal  && <span className="kin-state-item"><span className="kin-state-var">q̇</span>{qdVal}</span>}
          {qddVal && <span className="kin-state-item"><span className="kin-state-var">q̈</span>{qddVal}</span>}
        </div>
      )}

      {/* Aᵢ — local transform */}
      <div className="kin-section">
        <CollapsibleMatrix
          matrixType="A"
          label={aLabel}
          sublabel="local frame (n t b p)"
        >
          <MatrixDisplay
            matrix={aMatrix}
            colHeaders={['n', 't', 'b', 'p']}
            translationCol={3}
            angleDeg={symAngle}
            varLabel={symVar}
            numeric={numeric}
          />
        </CollapsibleMatrix>
      </div>

      {/* T₀ᵢ — world transform */}
      <div className="kin-section">
        <CollapsibleMatrix
          matrixType="T"
          label={tLabel}
          sublabel="world frame (n t b p)"
        >
          <MatrixDisplay
            matrix={cumulativeMatrix}
            colHeaders={['n', 't', 'b', 'p']}
            translationCol={3}
            symbolicRotation={numeric ? undefined : frame.symbolicCumulativeRotation}
            symbolicTranslation={numeric ? undefined : frame.symbolicCumulativeTranslation}
            numeric={numeric}
          />
        </CollapsibleMatrix>
      </div>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function KinematicsPanel() {
  const { nodes, edges, frames, selectedNode } = useScene()
  const [numeric, setNumeric] = useState(false)

  // Find end-effectors to anchor full-chain display even without selection
  const endEffectors = useMemo(
    () => nodes.filter((n) => n.kind === 'end-effector'),
    [nodes],
  )

  // When nothing is selected, show chain to first end-effector (or full scene).
  // When something is selected, show the chain through that node.
  const chainSourceId: string | null = useMemo(() => {
    if (selectedNode) return selectedNode.id
    if (endEffectors.length > 0) return endEffectors[0].id
    // Fallback: use any node that is a leaf (no outgoing edges)
    const leaf = nodes.find((n) => !edges.some((e) => e.fromId === n.id))
    return leaf?.id ?? null
  }, [selectedNode, endEffectors, nodes, edges])

  const kinFrames = useMemo(() => {
    if (!chainSourceId) return []
    return computeKinematicChain(chainSourceId, frames, nodes, edges)
  }, [chainSourceId, frames, nodes, edges])

  const jacobianCols = useMemo(() => {
    if (kinFrames.length === 0) return []
    // EE position: use the end-effector node if available, otherwise last frame
    const eeId = endEffectors[0]?.id
    const eePos = (eeId ? frames.get(eeId)?.worldPosition : undefined)
      ?? kinFrames[kinFrames.length - 1].worldPosition
    return computeJacobian(kinFrames, eePos)
  }, [kinFrames, endEffectors, frames])

  if (kinFrames.length === 0) {
    return (
      <PanelShell title="Forward Kinematics">
        <p className="sidebar-empty kin-empty">
          Add joints to view the kinematic chain.
        </p>
      </PanelShell>
    )
  }

  const n = kinFrames.length - 1
  const chainEq =
    n === 0
      ? 'T₀ = A₀'
      : `T₀${sub(n)} = ` + Array.from({ length: n + 1 }, (_, i) => `A${sub(i)}`).join(' × ')

  return (
    <PanelShell title="Forward Kinematics">
      {/* Toolbar: chain equation + numeric toggle */}
      <div className="kin-equation">
        <div className="kin-equation-label">Kinematic chain</div>
        <div className="kin-equation-expr">{chainEq}</div>
        <div className="kin-equation-note">
          A = [R&nbsp;|&nbsp;p ; 0&nbsp;1] &nbsp;·&nbsp; n,t,b = rotation axes, p = position
        </div>
        <div className="kin-numeric-toggle">
          <label className="kin-toggle-label">
            <input
              type="checkbox"
              className="kin-toggle-input"
              checked={numeric}
              onChange={(e) => setNumeric(e.target.checked)}
            />
            <span className={`kin-toggle-track${numeric ? ' is-on' : ''}`} />
            <span className={`kin-toggle-text${numeric ? ' is-on' : ''}`}>
              {numeric ? 'Calculated values' : 'Symbolic formulas'}
            </span>
          </label>
        </div>
      </div>

      {/* Per-frame cards */}
      <div className="kin-frames">
        {kinFrames.map((frame) => (
          <FrameCard key={frame.node.id} frame={frame} numeric={numeric} />
        ))}
      </div>

      {/* Jacobian */}
      <div className="kin-section kin-jacobian-section">
        <CollapsibleMatrix
          matrixType="J"
          label="Jacobian"
          sublabel="ẋ = J q̇   (top: linear vel, bottom: angular vel)"
          defaultOpen={false}
        >
          <div className="kin-jacobian-note">
            Rows: linear vₓ vy vz · angular ωₓ ωy ωz &nbsp;|&nbsp; Columns: one per DOF
          </div>
          <JacobianDisplay columns={jacobianCols} />
        </CollapsibleMatrix>
      </div>
    </PanelShell>
  )
}
