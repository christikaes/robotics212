/**
 * Sidebar — left-side icon rail + collapsible panel.
 *
 * Clicking the active tab's icon toggles the panel closed. Clicking a
 * different tab switches to it and ensures the panel is open.
 *
 * Tabs marked `bottom: true` in PANELS are pinned to the bottom of the rail.
 */

import { useState } from 'react'
import { PANELS } from '../panels'

const mainTabs   = PANELS.filter((p) => !p.bottom)
const bottomTabs = PANELS.filter((p) =>  p.bottom)

export function Sidebar() {
  const [activeTab, setActiveTab] = useState<string>(PANELS[0].id)
  const [open, setOpen] = useState(true)

  const handleTabClick = (id: string) => {
    if (id === activeTab) {
      setOpen((o) => !o)
    } else {
      setActiveTab(id)
      setOpen(true)
    }
  }

  const ActivePanel =
    PANELS.find((p) => p.id === activeTab)?.Panel ?? PANELS[0].Panel

  const renderTab = (tab: (typeof PANELS)[number]) => {
    const isActive = activeTab === tab.id && open
    return (
      <button
        key={tab.id}
        className={`sidebar-tab ${isActive ? 'active' : ''}`}
        onClick={() => handleTabClick(tab.id)}
        aria-pressed={isActive}
      >
        <span className="sidebar-tab-icon">{tab.icon}</span>
        <span className="sidebar-tab-label">{tab.label}</span>
      </button>
    )
  }

  return (
    <aside className="sidebar">
      <nav className="sidebar-tabs">
        <div className="sidebar-tabs-main">
          {mainTabs.map(renderTab)}
        </div>
        <div className="sidebar-tabs-bottom">
          {bottomTabs.map(renderTab)}
        </div>
      </nav>
      {open && (
        <div className="sidebar-panel">
          <ActivePanel />
        </div>
      )}
    </aside>
  )
}
