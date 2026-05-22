/**
 * Sidebar panel registry.
 *
 * Each tab maps to a panel component. Add a new tab by adding an entry here.
 */

import type { ComponentType } from 'react'
import { ProjectsPanel } from './ProjectsPanel'
import { KinematicsPanel } from './KinematicsPanel'
import { FKPanel } from './FKPanel'
import { IKPanel } from './IKPanel'
import { SingularitiesPanel } from './SingularitiesPanel'
import { SettingsPanel } from './SettingsPanel'

export interface PanelDef {
  id: string
  label: string
  icon: string
  Panel: ComponentType
  /** If true, this tab is pinned to the bottom of the icon rail. */
  bottom?: boolean
}

export const PANELS: PanelDef[] = [
  { id: 'projects',      label: 'Projects',      icon: '▦', Panel: ProjectsPanel      },
  { id: 'transforms',    label: 'Transforms',    icon: '⊞', Panel: KinematicsPanel    },
  { id: 'singularities', label: 'Singularities', icon: '⚠', Panel: SingularitiesPanel },
  { id: 'fk',            label: 'FK',            icon: 'ƒ', Panel: FKPanel            },
  { id: 'ik',            label: 'IK',            icon: '⇌', Panel: IKPanel            },
  { id: 'settings',      label: 'Settings',      icon: '⚙', Panel: SettingsPanel,      bottom: true },
]
