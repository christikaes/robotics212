import { PanelShell } from './PanelShell'
import { useScene } from '../scene/SceneContext'
import type { PendingKind } from '../scene/types'

interface Tile {
  kind: PendingKind
  label: string
  icon: string
}

const JOINT_TILES: Tile[] = [
  { kind: 'revolute',     label: 'Revolute',     icon: '⟳' },
  { kind: 'prismatic',    label: 'Prismatic',     icon: '↕' },
  { kind: 'spherical',    label: 'Spherical',     icon: '◉' },
  { kind: 'end-effector', label: 'End Effector',  icon: '➤' },
]

const LINK_TILES: Tile[] = [
  { kind: 'link', label: 'Link', icon: '▮' },
]

export function ElementsPanel() {
  const { beginAdd, pendingAdd } = useScene()

  return (
    <PanelShell title="Elements">
      <section className="element-category">
        <h4 className="element-category-title">Joints</h4>
        <div className="element-list">
          {JOINT_TILES.map((tile) => (
            <button
              key={tile.kind}
              className={`element-tile${pendingAdd?.kind === tile.kind ? ' is-active' : ''}`}
              onClick={() => beginAdd(tile.kind)}
              title={tile.label}
            >
              <span className="element-tile-icon" aria-hidden>{tile.icon}</span>
              <span className="element-tile-label">{tile.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="element-category">
        <h4 className="element-category-title">Links</h4>
        <div className="element-list">
          {LINK_TILES.map((tile) => (
            <button
              key={tile.kind}
              className={`element-tile${pendingAdd?.kind === tile.kind ? ' is-active' : ''}`}
              onClick={() => beginAdd(tile.kind)}
              title={tile.label}
            >
              <span className="element-tile-icon" aria-hidden>{tile.icon}</span>
              <span className="element-tile-label">{tile.label}</span>
            </button>
          ))}
        </div>
      </section>
    </PanelShell>
  )
}
