/**
 * OverlayLabels — Html overlays rendered inside the R3F Canvas.
 *
 * - Link edges: label at midpoint showing length in metres.
 * - Prismatic joints: label at joint position showing extension in metres.
 * - Revolute joints: angle is drawn as an arc directly in RevoluteJointMesh.
 *
 * Visibility is controlled by SettingsContext.showOverlays.
 */

import { Html } from '@react-three/drei'
import { useScene } from '../scene/SceneContext'
import { useSettings } from '../scene/SettingsContext'
import type { Vec3 } from '../scene/types'

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
}

export function OverlayLabels() {
  const { nodes, edges, frames } = useScene()
  const { showOverlays } = useSettings()

  if (!showOverlays) return null

  return (
    <>
      {/* Link length labels */}
      {edges.map((e) => {
        const from = frames.get(e.fromId)?.worldPosition
        const to   = frames.get(e.toId)?.worldPosition
        if (!from || !to) return null
        const mid = midpoint(from, to)
        return (
          <Html key={`len-${e.id}`} position={mid} center pointerEvents="none">
            <div className="overlay-label overlay-label-length">
              {e.length.toFixed(2)} m
            </div>
          </Html>
        )
      })}

      {/* Prismatic joint extension labels */}
      {nodes
        .filter((n) => n.kind === 'prismatic')
        .map((n) => {
          const worldPos = frames.get(n.id)?.worldPosition ?? n.position
          return (
            <Html key={`ext-${n.id}`} position={worldPos} center pointerEvents="none">
              <div className="overlay-label overlay-label-ext">
                +{(n.extension ?? 0).toFixed(2)} m
              </div>
            </Html>
          )
        })}
    </>
  )
}
