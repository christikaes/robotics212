/**
 * Grid.tsx — Tinkercad-style workplane grid.
 *
 * Fixed-extent RGB axis grid that fades radially toward the edges.
 *   - Red   X centerline
 *   - Green Y vertical axis
 *   - Blue  Z centerline
 *   - Gray  regular gridlines at 1m spacing
 */

import { useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'

const HALF = 20             // grid extends ±20m
const STEP = 1              // 1m between gridlines
const SUBDIV = 80           // subdivisions per line for smooth radial fade
const FADE_START = 0.55     // fraction of HALF where the fade begins

const COLOR_GRAY = new THREE.Color('#adb5bd')
const COLOR_X    = new THREE.Color('#ef4444')
const COLOR_Y    = new THREE.Color('#22c55e')
const COLOR_Z    = new THREE.Color('#3b82f6')

function alphaAt(x: number, y: number, z: number) {
  const r = Math.sqrt(x * x + z * z)
  const d = Math.max(r, Math.abs(y))
  const t = (d / HALF - FADE_START) / (1 - FADE_START)
  return Math.max(0, Math.min(1, 1 - t))
}

const LABEL_OFFSET = HALF * 0.85   // place labels at 85% of grid extent

const AXIS_LABELS: { pos: [number, number, number]; text: string; color: string }[] = [
  { pos: [ LABEL_OFFSET, 0.05, 0], text: 'x+', color: '#ef4444' },
  { pos: [-LABEL_OFFSET, 0.05, 0], text: 'x−', color: '#ef4444' },
  { pos: [0,  LABEL_OFFSET, 0],    text: 'y+', color: '#22c55e' },
  { pos: [0, -LABEL_OFFSET, 0],    text: 'y−', color: '#22c55e' },
  { pos: [0, 0.05,  LABEL_OFFSET], text: 'z+', color: '#3b82f6' },
  { pos: [0, 0.05, -LABEL_OFFSET], text: 'z−', color: '#3b82f6' },
]

export function AxisLabels() {
  return (
    <>
      {AXIS_LABELS.map(({ pos, text, color }) => (
        <Html key={text} position={pos} center pointerEvents="none">
          <span style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            fontWeight: 600,
            color,
            opacity: 0.75,
            userSelect: 'none',
            pointerEvents: 'none',
          }}>
            {text}
          </span>
        </Html>
      ))}
    </>
  )
}

export function Grid() {
  const geo = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []

    const addSegmentedLine = (
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
      c: THREE.Color,
    ) => {
      for (let s = 0; s < SUBDIV; s++) {
        const t0 = s / SUBDIV
        const t1 = (s + 1) / SUBDIV
        const x0 = ax + (bx - ax) * t0
        const y0 = ay + (by - ay) * t0
        const z0 = az + (bz - az) * t0
        const x1 = ax + (bx - ax) * t1
        const y1 = ay + (by - ay) * t1
        const z1 = az + (bz - az) * t1
        positions.push(x0, y0, z0, x1, y1, z1)
        const a0 = alphaAt(x0, y0, z0)
        const a1 = alphaAt(x1, y1, z1)
        colors.push(c.r, c.g, c.b, a0, c.r, c.g, c.b, a1)
      }
    }

    // Y centerline (vertical)
    addSegmentedLine(0, -HALF, 0, 0, HALF, 0, COLOR_Y)

    for (let i = -HALF; i <= HALF; i += STEP) {
      if (i === 0) addSegmentedLine(-HALF, 0.001, 0, HALF, 0.001, 0, COLOR_X)
      else addSegmentedLine(-HALF, 0, i, HALF, 0, i, COLOR_GRAY)

      if (i === 0) addSegmentedLine(0, 0.001, -HALF, 0, 0.001, HALF, COLOR_Z)
      else addSegmentedLine(i, 0, -HALF, i, 0, HALF, COLOR_GRAY)
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
    return g
  }, [])

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial vertexColors transparent depthWrite={false} />
    </lineSegments>
  )
}
