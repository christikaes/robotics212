/**
 * ContextMenuHost — dispatches to the right context menu for the selection.
 */

import { useScene } from '../scene/SceneContext'
import { NodeContextMenu, EdgeContextMenu } from './menus'

export function ContextMenuHost() {
  const { selectedNode, selectedEdge } = useScene()

  if (selectedNode) return <NodeContextMenu node={selectedNode} />
  if (selectedEdge) return <EdgeContextMenu edge={selectedEdge} />
  return null
}
