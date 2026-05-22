interface PanelShellProps {
  title: string
  children?: React.ReactNode
}

export function PanelShell({ title, children }: PanelShellProps) {
  return (
    <>
      <h3>{title}</h3>
      {children ?? <p className="sidebar-empty">Nothing here yet.</p>}
    </>
  )
}
