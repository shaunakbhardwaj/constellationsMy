import React from 'react'
import {
    HomeIcon,
    SearchIcon,
    FilesIcon,
    AutonomousIcon,
    SettingsIcon,
    LogoIcon
} from './Icons'

export type Panel = 'home' | 'search' | 'files' | 'autonomous' | 'settings'

interface SidebarProps {
    activePanel: Panel
    onPanelChange: (panel: Panel) => void
}

interface NavItemProps {
    panel: Panel
    activePanel: Panel
    icon: React.ReactNode
    label: string
    onClick: (panel: Panel) => void
}

function NavItem({ panel, activePanel, icon, label, onClick }: NavItemProps): React.JSX.Element {
    return (
        <button
            className={`nav-item ${activePanel === panel ? 'active' : ''}`}
            onClick={() => onClick(panel)}
            type="button"
        >
            {icon}
            {label}
        </button>
    )
}

export function Sidebar({ activePanel, onPanelChange }: SidebarProps): React.JSX.Element {
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <LogoIcon />
                <span className="logo-text">Constellations</span>
            </div>

            <nav className="sidebar-nav">
                <NavItem
                    panel="home"
                    activePanel={activePanel}
                    icon={<HomeIcon />}
                    label="Home"
                    onClick={onPanelChange}
                />
                <NavItem
                    panel="search"
                    activePanel={activePanel}
                    icon={<SearchIcon />}
                    label="Search"
                    onClick={onPanelChange}
                />
                <NavItem
                    panel="files"
                    activePanel={activePanel}
                    icon={<FilesIcon />}
                    label="Files"
                    onClick={onPanelChange}
                />
                <NavItem
                    panel="autonomous"
                    activePanel={activePanel}
                    icon={<AutonomousIcon />}
                    label="Autonomous"
                    onClick={onPanelChange}
                />
            </nav>

            <div className="sidebar-footer">
                <button
                    className={`settings-button ${activePanel === 'settings' ? 'active' : ''}`}
                    onClick={() => onPanelChange('settings')}
                    title="Settings"
                    type="button"
                >
                    <SettingsIcon />
                </button>
            </div>
        </aside>
    )
}

export default Sidebar
