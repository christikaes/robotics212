/**
 * TransformEditor — position + rotation editor for any scene node.
 *
 * compact=true   renders only the axis rows (no header, no delete button)
 *                for embedding inside a parent menu like AnchorContextMenu.
 * compact=false  (default) renders the full standalone context menu card.
 */

import { useScene } from '../scene/SceneContext'
import { NODE_LABEL } from '../scene/types'
import type { SceneNode, Vec3 } from '../scene/types'

const RAD = Math.PI / 180

interface Props {
  node: SceneNode
  /** When true, omit header and delete button (for embedding inside another menu). */
  compact?: boolean
}

export function TransformEditor({ node, compact = false }: Props) {
  const { updateNode, removeNode } = useScene()

  const setPos = (axis: 0 | 1 | 2, v: number) => {
    const next = [...node.position] as Vec3
    next[axis] = v
    updateNode(node.id, { position: next })
  }

  const setRotDeg = (axis: 0 | 1 | 2, deg: number) => {
    const next = [...node.rotation] as Vec3
    next[axis] = deg * RAD
    updateNode(node.id, { rotation: next })
  }

  const body = (
    <>
      <section className="context-section">
        {!compact && <h4>Position</h4>}
        <div className="axis-row">
          <AxisInput label="X" value={node.position[0]} onChange={(v) => setPos(0, v)} />
          <AxisInput label="Y" value={node.position[1]} onChange={(v) => setPos(1, v)} />
          <AxisInput label="Z" value={node.position[2]} onChange={(v) => setPos(2, v)} />
        </div>
      </section>

      <section className="context-section">
        <h4>Rotation (°)</h4>
        <div className="axis-row">
          <AxisInput label="X" value={node.rotation[0] / RAD} onChange={(v) => setRotDeg(0, v)} />
          <AxisInput label="Y" value={node.rotation[1] / RAD} onChange={(v) => setRotDeg(1, v)} />
          <AxisInput label="Z" value={node.rotation[2] / RAD} onChange={(v) => setRotDeg(2, v)} />
        </div>
      </section>
    </>
  )

  if (compact) return <>{body}</>

  return (
    <div className="context-menu">
      <div className="context-menu-header">
        <span className="context-menu-type">{NODE_LABEL[node.kind]}</span>
        <span className="context-menu-id">{node.id}</span>
      </div>

      {body}

      <button className="btn-danger" onClick={() => removeNode(node.id)}>
        Delete
      </button>
    </div>
  )
}

interface AxisInputProps {
  label: string
  value: number
  onChange: (v: number) => void
}

function AxisInput({ label, value, onChange }: AxisInputProps) {
  return (
    <label className="axis-input">
      <span className={`axis-label axis-${label.toLowerCase()}`}>{label}</span>
      <input
        type="number"
        step={0.1}
        value={Number(value.toFixed(3))}
        onChange={(e) => {
          const n = parseFloat(e.target.value)
          if (!Number.isNaN(n)) onChange(n)
        }}
      />
    </label>
  )
}
