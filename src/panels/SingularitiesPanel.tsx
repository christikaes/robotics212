import { useEffect, useMemo } from 'react'
import { useScene } from '../scene/SceneContext'
import { computeJacobian } from '../scene/transformEngine'
import type { JacobianColumn, KinematicFrame } from '../scene/transformEngine'
import type { Vec3 } from '../scene/types'
import {
  buildSymJacobian,
  symDetJTJ,
  solveDetEqualsZero,
  eeSymTransFromStrings,
  type SingularCondition,
} from '../scene/symJacobian'
import { _setSingularGlobal } from '../App'

// ── Chain walk ────────────────────────────────────────────────────────────────

function useJacobianData(): {
  numericCols: JacobianColumn[]
  symConditions: SingularCondition[]
  detFormula: string
  detValue: number
  jointIds: string[]
} {
  const { nodes, edges, frames } = useScene()

  return useMemo(() => {
    const empty = { numericCols: [], symConditions: [], detFormula: '—', detValue: 0, jointIds: [] }

    const eeNode = nodes.find((n) => n.kind === 'end-effector')
    if (!eeNode) return empty

    const eeFrame = frames.get(eeNode.id)
    if (!eeFrame) return empty

    // Walk root→EE
    const chainIds: string[] = []
    const visited = new Set<string>()
    let cur: string | null = eeNode.id
    while (cur !== null) {
      if (visited.has(cur)) break
      visited.add(cur)
      chainIds.unshift(cur)
      const node = nodes.find((n) => n.id === cur)
      if (!node) break
      if (node.isAnchor || !edges.some((e) => e.toId === cur)) break
      const parentEdge = edges.find((e) => e.toId === cur)
      cur = parentEdge ? parentEdge.fromId : null
    }

    // Build joint KinematicFrames (revolute + prismatic only)
    const allFrames: KinematicFrame[] = chainIds.flatMap((id, i) => {
      const frame = frames.get(id)
      if (!frame) return []
      const { kind } = frame.node
      if (kind !== 'revolute' && kind !== 'prismatic') return []
      const isRoot = !edges.some((e) => e.toId === id)
      return [{
        ...frame,
        frameIndex: i,
        isSelected: false,
        relativePosition: (isRoot ? frame.worldPosition : frame.node.position) as Vec3,
      }]
    })

    const jointIds = allFrames.map((f) => f.node.id)

    const eePos = eeFrame.worldPosition

    // ── Numeric Jacobian ──────────────────────────────────────────────────────
    const numericCols = computeJacobian(allFrames, eePos)

    // ── Symbolic Jacobian + det ───────────────────────────────────────────────
    const eeSymTrans = eeSymTransFromStrings(eeFrame.symbolicCumulativeTranslation)
    const symCols = buildSymJacobian(allFrames, eeSymTrans)

    const { raw, formula } = symDetJTJ(symCols)

    const varLabels = symCols.map((c) => c.label)
    const symConditions = solveDetEqualsZero(raw, varLabels)

    // ── Numeric det(JᵀJ) ─────────────────────────────────────────────────────
    const detValue = detJTJ(numericCols)

    return { numericCols, symConditions, detFormula: formula, detValue, jointIds }
  }, [nodes, edges, frames])
}

// ── Numeric det(JᵀJ) ─────────────────────────────────────────────────────────

function detJTJ(cols: JacobianColumn[]): number {
  const n = cols.length
  if (n === 0) return 0

  const J: number[][] = Array.from({ length: 3 }, () => new Array(n).fill(0))
  cols.forEach((col, c) => {
    J[0][c] = col.Jv[0]; J[1][c] = col.Jv[1]; J[2][c] = col.Jv[2]
  })

  const JTJ: number[][] = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (__, c) => {
      let s = 0
      for (let k = 0; k < 3; k++) s += J[k][r] * J[k][c]
      return s
    })
  )

  if (n === 1) return JTJ[0][0]
  if (n === 2) return JTJ[0][0] * JTJ[1][1] - JTJ[0][1] * JTJ[1][0]
  if (n === 3) {
    const [[a, b, c], [d, e, f], [g, h, ii]] = JTJ
    return a * (e * ii - f * h) - b * (d * ii - f * g) + c * (d * h - e * g)
  }
  return detNxN(JTJ, n)
}

function detNxN(m: number[][], n: number): number {
  if (n === 1) return m[0][0]
  let det = 0
  for (let c = 0; c < n; c++) {
    const minor = m.slice(1).map((row) => row.filter((_, j) => j !== c))
    det += (c % 2 === 0 ? 1 : -1) * m[0][c] * detNxN(minor, n - 1)
  }
  return det
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SingularitiesPanel() {
  const { nodes, updateNode } = useScene()
  const { numericCols, symConditions, detFormula, detValue, jointIds } = useJacobianData()

  const isSingular = Math.abs(detValue) < 1e-4

  // Push singular state to the 3D scene bridge — must be before any early returns
  useEffect(() => {
    _setSingularGlobal?.(isSingular)
  }, [isSingular])

  /**
   * Build concrete preview configs from analytic conditions — must be before early returns.
   * For each single-variable condition (e.g. sin(θ₂)=0) with solution s°:
   *   set that joint to s°, all others to 0°.
   */
  const previewConfigs = useMemo(() => {
    const configs: Array<{ label: string; angles: Map<string, number> }> = []
    // variable label "1","2",... → joint node id
    const labelToId = new Map<string, string>()
    let r = 1, p = 1
    for (const id of jointIds) {
      const node = nodes.find((n) => n.id === id)
      if (!node) continue
      labelToId.set(node.kind === 'revolute' ? `${r++}` : `d${p++}`, id)
    }
    for (const cond of symConditions) {
      if (cond.variables.length !== 1) continue
      const varLabel = cond.variables[0]
      const id = labelToId.get(varLabel)
      if (!id) continue
      for (const sol of cond.solutions) {
        const angles = new Map<string, number>()
        for (const jid of jointIds) angles.set(jid, 0)
        angles.set(id, sol)
        configs.push({ label: `θ${varLabel} = ${sol}°`, angles })
      }
    }
    return configs
  }, [symConditions, jointIds, nodes])

  const hasEE = nodes.some((n) => n.kind === 'end-effector')
  if (!hasEE) {
    return <div className="sing-empty"><p>No end effector in scene.</p></div>
  }
  if (numericCols.length === 0) {
    return <div className="sing-empty"><p>No actuated joints found.</p></div>
  }

  const labels = new Map<string, string>()
  let ri = 1, pi = 1
  for (const col of numericCols) {
    labels.set(col.jointId, col.kind === 'revolute' ? `θ${ri++}` : `d${pi++}`)
  }

  const rows = [
    { label: 'vx', values: numericCols.map((c) => c.Jv[0]) },
    { label: 'vy', values: numericCols.map((c) => c.Jv[1]) },
    { label: 'vz', values: numericCols.map((c) => c.Jv[2]) },
  ]

  const applyConfig = (angles: Map<string, number>) => {
    for (const [id, angle] of angles) {
      updateNode(id, { angle })
    }
  }

  return (
    <div className="sing-panel">
      <div className="sing-header">
        <span className="sing-header-title">Jacobian</span>
      </div>

      {/* Numeric Jacobian table */}
      <div className="sing-jac-outer">
        <table className="sing-jac-table">
          <thead>
            <tr>
              <th className="sing-jac-row-label" />
              {numericCols.map((col) => (
                <th key={col.jointId} className="sing-jac-col-head">
                  {labels.get(col.jointId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, values }) => (
              <tr key={label}>
                <td className="sing-jac-row-label">{label}</td>
                {values.map((v, i) => (
                  <td
                    key={i}
                    className={`sing-jac-cell${Math.abs(v) < 1e-9 ? ' sing-jac-zero' : ''}`}
                  >
                    {v.toFixed(3)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className={`sing-det-row${isSingular ? ' sing-det-singular' : ''}`}>
          <span className="sing-det-label">det(JᵀJ)</span>
          <span className="sing-det-val">{detValue.toFixed(4)}</span>
          {isSingular && <span className="sing-det-badge">SINGULAR</span>}
        </div>
      </div>

      {/* Symbolic formula — hidden */}

      {/* Singular conditions */}
      {symConditions.length > 0 && (
        <div className="sing-conditions-section">
          <div className="sing-sym-header">Singular when</div>
          <ul className="sing-conditions-list">
            {symConditions.map((cond, i) => (
              <li key={i} className="sing-condition-item">
                <span className="sing-condition-eq">{cond.condition}</span>
                {cond.solutions.length > 0 && (
                  <span className="sing-condition-sols">
                    → {cond.solutions.map((s) => `${s}°`).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Click-to-preview singular configurations */}
      {previewConfigs.length > 0 && (
        <div className="sing-conditions-section">
          <div className="sing-sym-header">Preview singular configs</div>
          <ul className="sing-conditions-list">
            {previewConfigs.map((cfg, i) => (
              <li key={i} className="sing-condition-item sing-preview-item">
                <button
                  className="sing-preview-btn"
                  onClick={() => applyConfig(cfg.angles)}
                  title="Set arm to this configuration"
                >
                  {cfg.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
