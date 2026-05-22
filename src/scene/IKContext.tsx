/**
 * IKContext — shared IK target / velocity / simulation state.
 *
 * Both IKPanel (sidebar) and IKTargetMesh (canvas) read from this context so
 * they stay in sync without prop-drilling through App.
 */

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import type { Vec3 } from './types'

interface IKContextValue {
  /** Current IK target position in world space (metres). */
  target: Vec3
  setTarget: (t: Vec3) => void
  setTargetAxis: (axis: 0 | 1 | 2, value: number) => void

  /** End-effector velocity applied during simulation (m/s). */
  velocity: Vec3
  setVelocity: (v: Vec3) => void
  setVelocityAxis: (axis: 0 | 1 | 2, value: number) => void

  /** Whether the simulation loop is running. */
  isPlaying: boolean
  startSimulation: () => void
  stopSimulation: () => void
}

const IKContext = createContext<IKContextValue | null>(null)

export function IKProvider({ children }: { children: ReactNode }) {
  const [target, setTargetState] = useState<Vec3>([0, 0, 0])
  const [velocity, setVelocityState] = useState<Vec3>([0, 0, 0])
  const [isPlaying, setIsPlaying] = useState(false)

  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const velocityRef = useRef<Vec3>(velocity)
  useEffect(() => { velocityRef.current = velocity }, [velocity])

  const stopSimulation = useCallback(() => {
    setIsPlaying(false)
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    lastTimeRef.current = null
  }, [])

  const startSimulation = useCallback(() => {
    setIsPlaying(true)
    lastTimeRef.current = null

    const tick = (now: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = now
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1)
      lastTimeRef.current = now

      const vel = velocityRef.current
      setTargetState((prev) => [
        prev[0] + vel[0] * dt,
        prev[1] + vel[1] * dt,
        prev[2] + vel[2] * dt,
      ])

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // Stop on unmount
  useEffect(() => () => { stopSimulation() }, [stopSimulation])

  const setTarget = useCallback((t: Vec3) => setTargetState([...t] as Vec3), [])

  const setTargetAxis = useCallback((axis: 0 | 1 | 2, value: number) => {
    setTargetState((prev) => {
      const next = [...prev] as Vec3
      next[axis] = value
      return next
    })
  }, [])

  const setVelocity = useCallback((v: Vec3) => setVelocityState([...v] as Vec3), [])

  const setVelocityAxis = useCallback((axis: 0 | 1 | 2, value: number) => {
    setVelocityState((prev) => {
      const next = [...prev] as Vec3
      next[axis] = value
      return next
    })
  }, [])

  return (
    <IKContext.Provider value={{
      target, setTarget, setTargetAxis,
      velocity, setVelocity, setVelocityAxis,
      isPlaying, startSimulation, stopSimulation,
    }}>
      {children}
    </IKContext.Provider>
  )
}

export function useIK(): IKContextValue {
  const ctx = useContext(IKContext)
  if (!ctx) throw new Error('useIK must be used inside <IKProvider>')
  return ctx
}
