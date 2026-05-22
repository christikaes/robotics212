/**
 * Unified context menu for all joint types.
 *
 * Sections:
 *   - Anchor toggle (pin joint to world frame)
 *   - Joint type selector (revolute / prismatic / spherical / end-effector)
 *   - Type-specific controls
 *   - Delete
 */

import { useState, useEffect } from 'react'
import { useScene } from '../scene/SceneContext'
import { NODE_LABEL } from '../scene/types'
import type { JointKind, SceneEdge, SceneNode } from '../scene/types'


const JOINT_KINDS: Array<{ value: JointKind; label: string }> = [
  { value: 'revolute',     label: 'Revolute' },
  { value: 'prismatic',    label: 'Prismatic' },
  { value: 'spherical',    label: 'Spherical' },
  { value: 'end-effector', label: 'End Effector' },
]

// ─── Numeric input that holds local string state while editing ────────────────

/**
 * A number input that lets the user freely clear and retype without React
 * snapping the value back on every keystroke.
 *
 * - While focused: the user's raw text is preserved so they can clear to "".
 * - On blur / Enter: the value is parsed and committed; invalid input resets
 *   to the last committed canonical value.
 * - When the canonical `value` prop changes externally (e.g. selecting a
 *   different node), the display resets to the new value.
 */
function NumericInput({
  value,
  step = 1,
  className,
  onCommit,
}: {
  value: number
  step?: number
  className?: string
  onCommit: (v: number) => void
}) {
  const canonical = Number(value.toFixed(2))
  const [text, setText] = useState(String(canonical))

  // Sync when the external value changes (e.g. different node selected).
  useEffect(() => {
    setText(String(canonical))
  }, [canonical])

  const commit = () => {
    const parsed = parseFloat(text)
    if (Number.isNaN(parsed)) {
      setText(String(canonical)) // reset to last good value
    } else {
      onCommit(parsed)
      setText(String(Number(parsed.toFixed(2))))
    }
  }

  return (
    <input
      className={className}
      type="number"
      step={step}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
    />
  )
}

// ─── Type-specific config panels ─────────────────────────────────────────────

function RevoluteConfig({ node }: { node: SceneNode }) {
  const { updateNode } = useScene()
  const axis  = node.axis ?? [0, 0, 1]
  const angle = node.angle ?? 0
  const isPassive = !node.actuated

  // Which axis is currently active?
  const activeAxis: 0 | 1 | 2 = axis[0] !== 0 ? 0 : axis[1] !== 0 ? 1 : 2

  const setAxis = (axisIdx: 0 | 1 | 2) => {
    const newAxis: [number, number, number] = [0, 0, 0]
    newAxis[axisIdx] = 1
    updateNode(node.id, { axis: newAxis, angle })
  }

  const setAngle = (value: number) => {
    updateNode(node.id, { angle: value })
  }

  const axisLabels = ['X', 'Y', 'Z'] as const
  const axisClasses = ['axis-x', 'axis-y', 'axis-z']

  return (
    <>
      <section className="context-section">
        <h4>Rotation Axis</h4>
        <div className="revolute-axis-toggle">
          {axisLabels.map((label, i) => (
            <button
              key={label}
              className={`revolute-axis-btn revolute-axis-btn--${label.toLowerCase()}${activeAxis === i ? ' is-active' : ''}`}
              onClick={() => setAxis(i as 0 | 1 | 2)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      <section className="context-section">
        <h4>
          Angle (°)
          <span className={`axis-label-inline ${axisClasses[activeAxis]}`}>
            {axisLabels[activeAxis]}
          </span>
        </h4>
        {isPassive ? (
          <div className="passive-angle-display">
            <span className="passive-angle-note">Passive — angle set by constraint</span>
            <span className="passive-angle-value">{angle.toFixed(2)}°</span>
          </div>
        ) : (
          <div className="angle-slider-row">
            <input
              type="range"
              className="angle-slider"
              min={-180}
              max={180}
              step={1}
              value={angle}
              onChange={(e) => setAngle(Number(e.target.value))}
            />
            <NumericInput
              className="axis-input-field angle-number-input"
              value={angle}
              step={1}
              onCommit={setAngle}
            />
          </div>
        )}
      </section>
      <section className="context-section">
        <h4>Velocity / Acceleration</h4>
        <div className="revolute-axis-row">
          <span className="axis-label" style={{ minWidth: 28 }}>q̇</span>
          <NumericInput
            className="axis-input-field"
            value={node.velocity ?? 0}
            step={1}
            onCommit={(v) => updateNode(node.id, { velocity: v })}
          />
          <span className="axis-unit">°/s</span>
        </div>
        <div className="revolute-axis-row">
          <span className="axis-label" style={{ minWidth: 28 }}>q̈</span>
          <NumericInput
            className="axis-input-field"
            value={node.acceleration ?? 0}
            step={1}
            onCommit={(v) => updateNode(node.id, { acceleration: v })}
          />
          <span className="axis-unit">°/s²</span>
        </div>
      </section>
    </>
  )
}

function PrismaticConfig({ node }: { node: SceneNode }) {
  const { updateNode } = useScene()
  const ext = node.extension ?? 0

  return (
    <>
      <section className="context-section">
        <h4>Extension (m)</h4>
        <div className="angle-slider-row">
          <input
            type="range"
            className="angle-slider"
            min={-5}
            max={5}
            step={0.01}
            value={ext}
            onChange={(e) => updateNode(node.id, { extension: parseFloat(e.target.value) })}
          />
          <NumericInput
            className="axis-input-field angle-number-input"
            value={ext}
            step={0.1}
            onCommit={(v) => updateNode(node.id, { extension: v })}
          />
        </div>
      </section>
      <section className="context-section">
        <h4>Velocity / Acceleration</h4>
        <div className="revolute-axis-row">
          <span className="axis-label" style={{ minWidth: 28 }}>q̇</span>
          <NumericInput
            className="axis-input-field"
            value={node.velocity ?? 0}
            step={0.1}
            onCommit={(v) => updateNode(node.id, { velocity: v })}
          />
          <span className="axis-unit">m/s</span>
        </div>
        <div className="revolute-axis-row">
          <span className="axis-label" style={{ minWidth: 28 }}>q̈</span>
          <NumericInput
            className="axis-input-field"
            value={node.acceleration ?? 0}
            step={0.1}
            onCommit={(v) => updateNode(node.id, { acceleration: v })}
          />
          <span className="axis-unit">m/s²</span>
        </div>
      </section>
    </>
  )
}

// ─── Unified joint menu ───────────────────────────────────────────────────────

export function NodeContextMenu({ node }: { node: SceneNode }) {
  const { updateNode, removeNode } = useScene()

  return (
    <div className="context-menu">
      <div className="context-menu-header">
        <span className="context-menu-type">{NODE_LABEL[node.kind]}</span>
        <span className="context-menu-id">{node.id}</span>
      </div>

      {/* Anchor toggle */}
      <section className="context-section">
        <h4>World Anchor</h4>
        <div className="settings-row">
          <span className="settings-label" style={{ fontSize: 12 }}>
            Fix position to world frame
          </span>
          <button
            className={`toggle-btn${node.isAnchor ? ' is-on' : ''}`}
            onClick={() => updateNode(node.id, { isAnchor: !node.isAnchor })}
            aria-pressed={!!node.isAnchor}
          >
            {node.isAnchor ? 'ON' : 'OFF'}
          </button>
        </div>
      </section>

      {/* Actuated / passive toggle (only for DOF joints) */}
      {(node.kind === 'revolute' || node.kind === 'prismatic' || node.kind === 'spherical') && (
        <section className="context-section">
          <h4>Actuation</h4>
          <div className="settings-row">
            <span className="settings-label" style={{ fontSize: 12 }}>
              Motor-driven joint
            </span>
            <button
              className={`toggle-btn${node.actuated ? ' is-on' : ''}`}
              onClick={() => updateNode(node.id, { actuated: !node.actuated })}
              aria-pressed={!!node.actuated}
            >
              {node.actuated ? 'Actuated' : 'Passive'}
            </button>
          </div>
        </section>
      )}

      {/* Joint type selector */}
      <section className="context-section">
        <h4>Joint Type</h4>
        <div className="joint-type-row">
          {JOINT_KINDS.map(({ value, label }) => (
            <button
              key={value}
              className={`joint-type-btn${node.kind === value ? ' is-active' : ''}`}
              onClick={() => updateNode(node.id, { kind: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Type-specific controls */}
      {node.kind === 'revolute'  && <RevoluteConfig node={node} />}
      {node.kind === 'prismatic' && <PrismaticConfig node={node} />}

      <button className="btn-danger" onClick={() => removeNode(node.id)}>
        Delete
      </button>
    </div>
  )
}

// ─── Edge ────────────────────────────────────────────────────────────────────

export function EdgeContextMenu({ edge }: { edge: SceneEdge }) {
  const { removeEdge, updateEdge } = useScene()

  return (
    <div className="context-menu">
      <div className="context-menu-header">
        <span className="context-menu-type">Link</span>
        <span className="context-menu-id">{edge.id}</span>
      </div>

      <section className="context-section">
        <h4>Endpoints</h4>
        <div className="endpoint-row">
          <span>From</span><code>{edge.fromId}</code>
        </div>
        <div className="endpoint-row">
          <span>To</span><code>{edge.toId}</code>
        </div>
      </section>

      <section className="context-section">
        <h4>Length (m)</h4>
        <input
          className="length-input"
          type="number"
          step={0.1}
          min={0.01}
          value={Number(edge.length.toFixed(3))}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) updateEdge(edge.id, { length: v })
          }}
        />
      </section>

      <button className="btn-danger" onClick={() => removeEdge(edge.id)}>
        Delete
      </button>
    </div>
  )
}
