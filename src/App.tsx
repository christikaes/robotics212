import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Grid, AxisLabels } from './meshes/Grid'
import { RevoluteJointMesh } from './meshes/RevoluteJointMesh'
import { PrismaticJointMesh } from './meshes/PrismaticJointMesh'
import { SphericalJointMesh } from './meshes/SphericalJointMesh'
import { EndEffectorMesh } from './meshes/EndEffectorMesh'
import { LinkEdgeMesh } from './meshes/LinkEdgeMesh'
import { IKTargetMesh } from './meshes/IKTargetMesh'
import { Sidebar } from './components/Sidebar'
import { SceneProvider, useScene } from './scene/SceneContext'
import { SettingsProvider } from './scene/SettingsContext'
import { IKProvider } from './scene/IKContext'
import { OverlayLabels } from './meshes/OverlayLabels'
import { ContextMenuHost } from './contextMenus'
import { PENDING_LABEL } from './scene/types'

import './App.css'

function SceneGraph() {
  const { nodes, edges, frames } = useScene()

  // Track IK convergence for target mesh colour (passed up from IKPanel via a
  // simple piece of module-level state; IKPanel sets it, SceneGraph reads it).
  const hasEE = nodes.some((n) => n.kind === 'end-effector')
  const [ikConverged, setIkConverged] = useState(false)
  const [isSingular, setIsSingular] = useState(false)

  // IKPanel writes convergence via the exported setter below.
  useEffect(() => {
    _setIkConvergedGlobal = setIkConverged
    return () => { _setIkConvergedGlobal = null }
  }, [setIkConverged])

  // SingularitiesPanel writes singular state via the exported setter below.
  useEffect(() => {
    _setSingularGlobal = setIsSingular
    return () => { _setSingularGlobal = null }
  }, [setIsSingular])

  return (
    <>
      {nodes.map((n) => {
        switch (n.kind) {
          case 'revolute':     return <RevoluteJointMesh key={n.id} node={n} />
          case 'prismatic':    return <PrismaticJointMesh key={n.id} node={n} />
          case 'spherical':    return <SphericalJointMesh key={n.id} node={n} />
          case 'end-effector': return <EndEffectorMesh key={n.id} node={n} />
          default:             return null
        }
      })}
      {edges.map((e) => {
        const from = frames.get(e.fromId)?.worldPosition
        const to   = frames.get(e.toId)?.worldPosition
        if (!from || !to) return null
        return <LinkEdgeMesh key={e.id} edge={e} from={from} to={to} singular={isSingular} />
      })}
      <IKTargetMesh converged={ikConverged} visible={hasEE} />
    </>
  )
}

/** Module-level bridge so IKPanel can push convergence state into SceneGraph. */
export let _setIkConvergedGlobal: ((v: boolean) => void) | null = null

/** Module-level bridge so SingularitiesPanel can push singular state into SceneGraph. */
export let _setSingularGlobal: ((v: boolean) => void) | null = null

function PendingBanner() {
  const { pendingAdd, cancelAdd } = useScene()
  if (!pendingAdd) return null

  const label = PENDING_LABEL[pendingAdd.kind]
  const detail =
    pendingAdd.kind === 'link'
      ? pendingAdd.stage === 'second'
        ? 'Pick the second endpoint'
        : 'Pick the first endpoint'
      : 'Click a node to attach'

  return (
    <div className="pending-banner">
      <span className="pending-banner-label">Adding {label}</span>
      <span className="pending-banner-detail">{detail}</span>
      <button className="btn-ghost" onClick={cancelAdd}>Cancel (Esc)</button>
    </div>
  )
}

function Workspace() {
  const { select, pendingAdd, cancelAdd } = useScene()

  useEffect(() => {
    if (!pendingAdd) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelAdd()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingAdd, cancelAdd])

  const handleEmptyClick = () => {
    if (pendingAdd) cancelAdd()
    else select(null)
  }

  return (
    <main className="workspace">
      <div className="canvas-frame">
        <Canvas camera={{ position: [8, 8, 8], fov: 50 }} shadows>
          <color attach="background" args={['#f8f9fa']} />

          <ambientLight intensity={1.0} />
          <directionalLight position={[5, 8, 6]} intensity={0.8} castShadow />

          <Grid />
          <AxisLabels />
          <SceneGraph />
          <OverlayLabels />

          {/* Click empty space to deselect or cancel pending add */}
          <mesh
            position={[0, -0.01, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={handleEmptyClick}
            visible={false}
          >
            <planeGeometry args={[200, 200]} />
            <meshBasicMaterial />
          </mesh>

          <OrbitControls
            makeDefault
            maxPolarAngle={Math.PI / 2 - 0.01}
            minDistance={3}
            maxDistance={60}
          />
        </Canvas>
        <PendingBanner />
      </div>
      <ContextMenuHost />
    </main>
  )
}

function AppShell() {
  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-left">
          <div className="logo">R212</div>
          <nav className="appbar-nav">
            <button>File</button>
            <button>Edit</button>
            <button>View</button>
          </nav>
        </div>
        <div className="appbar-center">
          <input className="title-input" defaultValue="Untitled workspace" />
        </div>
        <div className="appbar-right">
          <button className="btn-ghost">Share</button>
          <button className="btn-primary">Export</button>
        </div>
      </header>

      <div className="body">
        <Sidebar />
        <Workspace />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <SceneProvider>
        <IKProvider>
          <AppShell />
        </IKProvider>
      </SceneProvider>
    </SettingsProvider>
  )
}
