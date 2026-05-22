/**
 * IKPanel — Inverse Kinematics Panel
 *
 * The user sets a target end-effector position (x, y, z).  The panel
 * continuously runs a damped Jacobian IK solver and writes the solved
 * joint angles back to SceneContext, which causes the 3D canvas to update
 * immediately via the FK engine.
 *
 * Solver: Jacobian Damped Least Squares (see ikSolver.ts).
 *
 * UX:
 *   - Target inputs (x / y / z) with per-axis sliders (disabled while playing).
 *   - Velocity inputs (vx / vy / vz) in m/s.
 *   - Play / Stop button: advances target by velocity × dt each rAF frame.
 *     Simulation stops automatically once the solver converges.
 *   - Live convergence status badge.
 *   - Read-only table of solved joint angles.
 *   - "Reset" button returns all angles to 0°.
 */

import { useState, useEffect, useMemo } from 'react'
import { useScene } from '../scene/SceneContext'
import { useIK } from '../scene/IKContext'
import { solveIK } from '../scene/ikSolver'
import { _setIkConvergedGlobal } from '../App'
import type { Vec3 } from '../scene/types'

// ── slider range ──────────────────────────────────────────────────────────────
const RANGE     = 10  // ± metres for position sliders
const VEL_RANGE = 5   // ± m/s for velocity sliders

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, d = 3) {
  return n.toFixed(d)
}

// ── AxisInput ─────────────────────────────────────────────────────────────────

interface AxisInputProps {
  axis: 'x' | 'y' | 'z'
  value: number
  onChange: (v: number) => void
  range?: number
  unit?: string
  disabled?: boolean
}

function AxisInput({ axis, value, onChange, range = RANGE, unit = 'm', disabled = false }: AxisInputProps) {
  const [text, setText] = useState(fmt(value))

  useEffect(() => { setText(fmt(value)) }, [value])

  const commit = () => {
    const parsed = parseFloat(text)
    if (!Number.isNaN(parsed)) onChange(parsed)
    else setText(fmt(value))
  }

  return (
    <div className="ik-axis-row">
      <span className={`ik-axis-tag ik-axis-tag--${axis}`}>{axis.toUpperCase()}</span>
      <input
        type="range"
        className="ik-slider"
        min={-range} max={range} step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => { const v = parseFloat(e.target.value); onChange(v); setText(fmt(v)) }}
      />
      <input
        className="ik-number-input"
        type="number"
        step={0.01}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
      <span className="ik-unit">{unit}</span>
    </div>
  )
}

// ── IKPanel ───────────────────────────────────────────────────────────────────

export function IKPanel() {
  const { nodes, edges, frames, updateNode } = useScene()
  const {
    target, setTarget, setTargetAxis,
    velocity, setVelocityAxis,
    isPlaying, startSimulation, stopSimulation,
  } = useIK()

  // ── End-effector selection ───────────────────────────────────────────────────
  const endEffectors = useMemo(
    () => nodes.filter((n) => n.kind === 'end-effector'),
    [nodes],
  )

  const [selectedEEId, setSelectedEEId] = useState<string | null>(null)

  useEffect(() => {
    if (endEffectors.length === 0) { setSelectedEEId(null); return }
    if (!selectedEEId || !endEffectors.find((e) => e.id === selectedEEId)) {
      setSelectedEEId(endEffectors[0].id)
    }
  }, [endEffectors, selectedEEId])

  // Current EE world position
  const eeFrame = selectedEEId ? frames.get(selectedEEId) : null
  const currentEEPos: Vec3 = eeFrame?.worldPosition ?? [0, 0, 0]

  // Snap target to EE position when the selected EE changes
  const [lastEEId, setLastEEId] = useState<string | null>(null)
  useEffect(() => {
    if (selectedEEId && selectedEEId !== lastEEId) {
      setLastEEId(selectedEEId)
      const f = frames.get(selectedEEId)
      if (f) setTarget([...f.worldPosition] as Vec3)
    }
  }, [selectedEEId, lastEEId, frames, setTarget])

  // ── IK solver ────────────────────────────────────────────────────────────────
  const solveResult = useMemo(() => {
    if (!selectedEEId) return null
    return solveIK(target, nodes, edges, selectedEEId)
  }, [target, nodes, edges, selectedEEId])

  // Apply solved angles back to scene
  useEffect(() => {
    if (!solveResult) return
    for (const [id, angle] of solveResult.angles) {
      updateNode(id, { angle })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solveResult])

  // Broadcast convergence to the canvas (for mesh colour)
  useEffect(() => {
    _setIkConvergedGlobal?.(solveResult?.converged ?? false)
  }, [solveResult?.converged])

  // Stop simulation as soon as solver converges
  useEffect(() => {
    if (isPlaying && solveResult?.converged) {
      stopSimulation()
    }
  }, [isPlaying, solveResult?.converged, stopSimulation])

  // ── Chain joints for display ─────────────────────────────────────────────────
  const chainJoints = useMemo(() => {
    if (!selectedEEId || !solveResult) return []
    return [...solveResult.angles.entries()].map(([id, angle]) => {
      const node = nodes.find((n) => n.id === id)
      return { id, angle, axis: node?.axis ?? [0, 0, 1] as Vec3 }
    })
  }, [solveResult, nodes, selectedEEId])

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (endEffectors.length === 0) {
    return (
      <div className="ik-empty">
        <p>No end effector in scene.</p>
        <p className="ik-empty-hint">Add an End Effector node to a kinematic chain to use IK.</p>
      </div>
    )
  }

  const hasChain = chainJoints.length > 0
  const statusLabel = !hasChain ? 'no revolute joints' : solveResult?.converged ? 'converged' : 'iterating'
  const statusClass  = !hasChain ? 'ik-status--warn' : solveResult?.converged ? 'ik-status--ok' : 'ik-status--iterating'

  return (
    <div className="ik-panel">
      <div className="ik-header">
        <span className="ik-header-title">Inverse Kinematics</span>
        <span className={`ik-status-badge ${statusClass}`}>{statusLabel}</span>
      </div>

      {/* End-effector selector */}
      {endEffectors.length > 1 && (
        <section className="ik-section">
          <h4 className="ik-section-title">End Effector</h4>
          <div className="ik-ee-selector">
            {endEffectors.map((ee) => (
              <button
                key={ee.id}
                className={`ik-ee-btn${selectedEEId === ee.id ? ' is-active' : ''}`}
                onClick={() => setSelectedEEId(ee.id)}
              >
                {ee.id}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Target position */}
      <section className="ik-section">
        <h4 className="ik-section-title">Target Position</h4>
        <AxisInput axis="x" value={target[0]} onChange={(v) => setTargetAxis(0, v)} disabled={isPlaying} />
        <AxisInput axis="y" value={target[1]} onChange={(v) => setTargetAxis(1, v)} disabled={isPlaying} />
        <AxisInput axis="z" value={target[2]} onChange={(v) => setTargetAxis(2, v)} disabled={isPlaying} />
      </section>

      {/* Velocity */}
      <section className="ik-section">
        <h4 className="ik-section-title">Velocity</h4>
        <AxisInput axis="x" value={velocity[0]} onChange={(v) => setVelocityAxis(0, v)} range={VEL_RANGE} unit="m/s" />
        <AxisInput axis="y" value={velocity[1]} onChange={(v) => setVelocityAxis(1, v)} range={VEL_RANGE} unit="m/s" />
        <AxisInput axis="z" value={velocity[2]} onChange={(v) => setVelocityAxis(2, v)} range={VEL_RANGE} unit="m/s" />
      </section>

      {/* Play / Stop */}
      <div className="ik-sim-row">
        <button
          className={`ik-sim-btn${isPlaying ? ' ik-sim-btn--stop' : ' ik-sim-btn--play'}`}
          onClick={isPlaying ? stopSimulation : startSimulation}
        >
          {isPlaying ? '■ Stop' : '▶ Play'}
        </button>
        {isPlaying && (
          <span className="ik-sim-hint">
            ({fmt(velocity[0], 2)}, {fmt(velocity[1], 2)}, {fmt(velocity[2], 2)}) m/s
          </span>
        )}
      </div>

      {/* Solve result */}
      {solveResult && (
        <section className="ik-section">
          <h4 className="ik-section-title">Result</h4>
          <div className="ik-result-grid">
            <span className="ik-result-label">Achieved</span>
            <span className="ik-result-value ik-mono">
              ({fmt(solveResult.achieved[0])},&nbsp;
               {fmt(solveResult.achieved[1])},&nbsp;
               {fmt(solveResult.achieved[2])})
            </span>
            <span className="ik-result-label">Error</span>
            <span className={`ik-result-value ik-mono${solveResult.converged ? ' ik-ok' : ' ik-warn'}`}>
              {fmt(solveResult.error, 5)} m
            </span>
            <span className="ik-result-label">Iterations</span>
            <span className="ik-result-value ik-mono">{solveResult.iterations}</span>
          </div>
        </section>
      )}

      {/* Solved angles table */}
      {chainJoints.length > 0 && (
        <section className="ik-section">
          <h4 className="ik-section-title">Solved Angles</h4>
          <div className="ik-joints-table">
            <div className="ik-joints-header">
              <span>Joint</span><span>Axis</span><span>θ (°)</span>
            </div>
            {chainJoints.map(({ id, angle, axis }) => {
              const axLabel = axis[0] !== 0 ? 'X' : axis[1] !== 0 ? 'Y' : 'Z'
              return (
                <div key={id} className="ik-joints-row">
                  <span className="ik-joint-id">{id}</span>
                  <span className={`ik-axis-tag ik-axis-tag--${axLabel.toLowerCase()}`}>{axLabel}</span>
                  <span className="ik-joint-angle ik-mono">{fmt(angle, 2)}°</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Current EE position */}
      <section className="ik-section">
        <h4 className="ik-section-title">Current EE Position</h4>
        <div className="ik-current-pos">
          {(['x','y','z'] as const).map((ax, i) => (
            <span key={ax} className="ik-pos-chip">
              <span className={`ik-axis-tag ik-axis-tag--${ax}`}>{ax.toUpperCase()}</span>
              <span className="ik-mono">{fmt(currentEEPos[i])}</span>
            </span>
          ))}
        </div>
      </section>

      {/* Reset */}
      <button
        className="ik-reset-btn"
        onClick={() => {
          stopSimulation()
          for (const { id } of chainJoints) updateNode(id, { angle: 0 })
          setTarget([...currentEEPos] as Vec3)
        }}
      >
        Reset Angles
      </button>
    </div>
  )
}
