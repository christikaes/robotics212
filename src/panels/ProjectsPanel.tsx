import { PanelShell } from './PanelShell'
import { PRESETS } from '../projects/presets'
import type { ProjectPreset } from '../projects/presets'
import { useScene } from '../scene/SceneContext'

export function ProjectsPanel() {
  const { loadProject } = useScene()

  return (
    <PanelShell title="Projects">
      <div className="project-list">
        {PRESETS.map((preset) => (
          <ProjectCard key={preset.id} preset={preset} onLoad={loadProject} />
        ))}
      </div>
    </PanelShell>
  )
}

interface ProjectCardProps {
  preset: ProjectPreset
  onLoad: (preset: ProjectPreset) => void
}

function ProjectCard({ preset, onLoad }: ProjectCardProps) {
  const jointCount = preset.nodes.filter(
    (n) => n.kind !== 'end-effector',
  ).length

  return (
    <button className="project-card" onClick={() => onLoad(preset)}>
      <div className="project-card-header">
        <span className="project-card-name">{preset.name}</span>
        <span className="project-card-badge">{preset.badge}</span>
      </div>
      <p className="project-card-desc">{preset.description}</p>
      <div className="project-card-footer">
        <span className="project-card-meta">{jointCount} joints</span>
        <span className="project-card-source">{preset.source}</span>
      </div>
    </button>
  )
}
