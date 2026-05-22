/**
 * AnchorMesh — diamond marker for a world-fixed reference frame.
 */

import { SelectableMesh } from './SelectableMesh'
import type { SceneNode } from '../scene/types'

export function AnchorMesh({ node }: { node: SceneNode }) {
  return (
    <SelectableMesh node={node} baseColor="#3b82f6" haloRadius={0.7}>
      <octahedronGeometry args={[0.25, 0]} />
    </SelectableMesh>
  )
}
