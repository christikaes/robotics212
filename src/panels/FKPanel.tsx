/**
 * Forward Kinematics Panel
 *
 * Shows every joint and link in the scene in topological (BFS) order from
 * root anchors down to end-effectors.  All joint angles, extensions, and link
 * lengths are editable inline — changes are written back to SceneContext and
 * immediately reflected in the 3D canvas.
 */

import { useState, useEffect } from 'react'
import { useScene } from '../scene/SceneContext'
import type { SceneNode, SceneEdge } from '../scene/types'
import type { TransformFrame } from '../scene/transformEngine'

// ── NumericInput (local copy — same pattern as menus.tsx) ─────────────────────

interface NumericInputProps {
  value: number
  step?: number
  min?: number
  className?: string
  onCommit: (v: number) => void
}

function NumericInput({ value, step = 1, min, className, onCommit }: NumericInputProps) {
  const canonical = Number(value.toFixed(3))
  const [text, setText] = useState(String(canonical))

  useEffect(() => { setText(String(canonical)) }, [canonical])

  const commit = () => {
    const parsed = parseFloat(text)
    if (Number.isNaN(parsed) || (min !== undefined && parsed < min)) {
      setText(String(canonical))
    } else {
      onCommit(parsed)
      setText(String(Number(parsed.toFixed(3))))
    }
  }

  return (
    <input
      className={className ?? 'fk-number-input'}
      type="number"
      step={step}
      min={min}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}

// ── JointRow ──────────────────────────────────────────────────────────────────

interface JointRowProps {
  node: SceneNode
  frame: TransformFrame | undefined
  depth: number
}

function JointRow({ node, frame, depth }: JointRowProps) {
  const { updateNode, select, selection } = useScene()
  const isSelected = selection?.kind === 'node' && selection.id === node.id

  const kindLabel: Record<string, string> = {
    revolute: 'R',
    prismatic: 'P',
    spherical: 'S',
    'end-effector': 'EE',
  }
  const kindColor: Record<string, string> = {
    revolute: 'var(--accent)',
    prismatic: '#22d3ee',
    spherical: '#a78bfa',
    'end-effector': '#f59e0b',
  }

  const hasDof = node.kind === 'revolute' || node.kind === 'prismatic' || node.kind === 'spherical'

  const axis = node.axis ?? [0, 0, 1]
  const angle = node.angle ?? 0
  const θLabels = ['θx', 'θy', 'θz'] as const

  // Which axis component is active (non-zero)?
  const activeAxis = axis[0] !== 0 ? 0 : axis[1] !== 0 ? 1 : 2

  const worldPos = frame?.worldPosition

  return (
    <div
      className={`fk-joint-row${isSelected ? ' fk-joint-row--selected' : ''}`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={() => select({ kind: 'node', id: node.id })}
    >
      {/* Kind badge */}
      <span
        className="fk-kind-badge"
        style={{ background: kindColor[node.kind] ?? '#888' }}
      >
        {kindLabel[node.kind]}
      </span>

      {/* ID */}
      <span className="fk-joint-id">{node.id}</span>

      {node.isAnchor && <span className="fk-anchor-tag">anchor</span>}

      {/* Actuated / passive pill — only for joints with DOF */}
      {hasDof && (
        <button
          className={`fk-actuated-btn${node.actuated ? ' is-actuated' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            updateNode(node.id, { actuated: !node.actuated })
          }}
          title={node.actuated ? 'Actuated — click to set passive' : 'Passive — click to set actuated'}
        >
          {node.actuated ? 'ACT' : 'PAS'}
        </button>
      )}

      {/* Revolute: axis toggle + single active-axis angle */}
      {node.kind === 'revolute' && (
        <div className="fk-revolute-controls">
          <div className="fk-axis-toggle">
            {(['x','y','z'] as const).map((ax, i) => (
              <button
                key={ax}
                className={`fk-axis-btn fk-axis-btn--${ax}${activeAxis === i ? ' is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  const newAxis: [number,number,number] = [0,0,0]
                  newAxis[i] = 1
                  updateNode(node.id, { axis: newAxis, angle })
                }}
              >
                {ax.toUpperCase()}
              </button>
            ))}
          </div>
          {node.actuated ? (
            <label className="fk-param-label fk-param-label--active">
              <span className={`fk-axis-tag fk-axis-tag--${['x','y','z'][activeAxis]}`}>
                {θLabels[activeAxis]}
              </span>
              <NumericInput
                value={angle}
                step={1}
                onCommit={(v) => {
                  updateNode(node.id, { angle: v })
                }}
              />
              <span className="fk-unit">°</span>
            </label>
          ) : (
            <span className="fk-passive-angle">
              <span className="fk-passive-tag">PAS</span>
              {angle.toFixed(1)}°
            </span>
          )}
        </div>
      )}

      {/* Prismatic: slider + extension input */}
      {node.kind === 'prismatic' && (
        <div className="fk-revolute-controls">
          <input
            type="range"
            className="fk-ext-slider"
            min={-5}
            max={5}
            step={0.01}
            value={node.extension ?? 0}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation()
              updateNode(node.id, { extension: parseFloat(e.target.value) })
            }}
          />
          <label className="fk-param-label fk-param-label--active">
            <span className="fk-axis-tag" style={{ background: '#22d3ee' }}>ext</span>
            <NumericInput
              value={node.extension ?? 0}
              step={0.1}
              onCommit={(v) => updateNode(node.id, { extension: v })}
            />
            <span className="fk-unit">m</span>
          </label>
        </div>
      )}

      {/* End-effector: show world position */}
      {node.kind === 'end-effector' && worldPos && (
        <div className="fk-world-pos">
          <span className="fk-world-pos-label">pos</span>
          {(['x','y','z'] as const).map((ax, i) => (
            <span key={ax} className="fk-world-coord">
              <span className={`fk-axis-tag fk-axis-tag--${ax}`}>{ax}</span>
              <span className="fk-world-val">{worldPos[i].toFixed(3)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── LinkRow ───────────────────────────────────────────────────────────────────

interface LinkRowProps {
  edge: SceneEdge
  depth: number
}

function LinkRow({ edge, depth }: LinkRowProps) {
  const { updateEdge, select, selection } = useScene()
  const isSelected = selection?.kind === 'edge' && selection.id === edge.id

  return (
    <div
      className={`fk-link-row${isSelected ? ' fk-link-row--selected' : ''}`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={() => select({ kind: 'edge', id: edge.id })}
    >
      <span className="fk-link-icon">↕</span>
      <span className="fk-link-id">{edge.id}</span>
      <div className="fk-revolute-controls">
        <input
          type="range"
          className="fk-ext-slider"
          min={0.1}
          max={10}
          step={0.01}
          value={edge.length}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation()
            updateEdge(edge.id, { length: parseFloat(e.target.value) })
          }}
        />
        <label className="fk-param-label fk-param-label--active">
          <span className="fk-axis-tag" style={{ background: '#6b7280' }}>L</span>
          <NumericInput
            value={edge.length}
            step={0.1}
            min={0.01}
            onCommit={(v) => updateEdge(edge.id, { length: v })}
          />
          <span className="fk-unit">m</span>
        </label>
      </div>
    </div>
  )
}

// ── FKPanel ───────────────────────────────────────────────────────────────────

export function FKPanel() {
  const { nodes, edges, frames } = useScene()

  // BFS from roots to produce a flat ordered list of (nodeId, depth) pairs
  const orderedItems: Array<{ type: 'node'; id: string; depth: number } | { type: 'edge'; id: string; depth: number }> = []

  const rootNodes = nodes.filter((n) => !edges.some((e) => e.toId === n.id))
  const visited = new Set<string>()
  const queue: Array<{ id: string; depth: number }> = rootNodes.map((n) => ({ id: n.id, depth: 0 }))

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)

    orderedItems.push({ type: 'node', id, depth })

    const outEdges = edges.filter((e) => e.fromId === id)
    for (const edge of outEdges) {
      orderedItems.push({ type: 'edge', id: edge.id, depth })
      queue.push({ id: edge.toId, depth: depth + 1 })
    }
  }

  if (nodes.length === 0) {
    return (
      <div className="fk-empty">
        <p>No joints yet.</p>
        <p className="fk-empty-hint">Add joints from the Elements panel to see their parameters here.</p>
      </div>
    )
  }

  return (
    <div className="fk-panel">
      <div className="fk-header">
        <span className="fk-header-title">Joint Parameters</span>
        <span className="fk-header-count">{nodes.length} joint{nodes.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="fk-chain">
        {orderedItems.map((item) => {
          if (item.type === 'node') {
            const node = nodes.find((n) => n.id === item.id)
            if (!node) return null
            return (
              <JointRow
                key={item.id}
                node={node}
                frame={frames.get(item.id)}
                depth={item.depth}
              />
            )
          } else {
            const edge = edges.find((e) => e.id === item.id)
            if (!edge) return null
            return (
              <LinkRow
                key={item.id}
                edge={edge}
                depth={item.depth}
              />
            )
          }
        })}
      </div>
    </div>
  )
}
