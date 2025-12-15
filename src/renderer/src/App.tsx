import { useState, useCallback } from 'react'
import { Sidebar, type Panel } from './components/Sidebar'
import { HomePanel, SearchPanel, FilesPanel, AutonomousPanel, SettingsPanel } from './components/panels'

function App(): React.JSX.Element {
  const [activePanel, setActivePanel] = useState<Panel>('home')

  const handlePanelChange = useCallback((panel: Panel) => {
    setActivePanel(panel)
  }, [])

  const handleNavigateToSearch = useCallback(() => {
    setActivePanel('search')
  }, [])

  return (
    <div className="app-layout">
      {/* Static Background */}
      <div className="bg-graphic">
        <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <circle cx="150" cy="120" r="2" fill="#333" />
          <circle cx="300" cy="200" r="1.5" fill="#444" />
          <circle cx="500" cy="100" r="2" fill="#333" />
          <circle cx="700" cy="250" r="1.5" fill="#444" />
          <circle cx="900" cy="150" r="2" fill="#333" />
          <circle cx="1100" cy="220" r="1.5" fill="#444" />
          <circle cx="200" cy="400" r="1.5" fill="#444" />
          <circle cx="450" cy="350" r="2" fill="#333" />
          <circle cx="650" cy="450" r="1.5" fill="#444" />
          <circle cx="850" cy="380" r="2" fill="#333" />
          <circle cx="1050" cy="420" r="1.5" fill="#444" />
          <line x1="150" y1="120" x2="300" y2="200" stroke="#333" strokeWidth="0.5" />
          <line x1="300" y1="200" x2="500" y2="100" stroke="#333" strokeWidth="0.5" />
          <line x1="700" y1="250" x2="900" y2="150" stroke="#333" strokeWidth="0.5" />
          <line x1="200" y1="400" x2="450" y2="350" stroke="#333" strokeWidth="0.5" />
          <line x1="450" y1="350" x2="650" y2="450" stroke="#333" strokeWidth="0.5" />
        </svg>
      </div>

      <Sidebar activePanel={activePanel} onPanelChange={handlePanelChange} />

      <main className="main-content">
        <div className="content-area">
          {activePanel === 'home' && (
            <HomePanel
              onNavigateToSearch={handleNavigateToSearch}
              onNavigateToPanel={handlePanelChange}
            />
          )}
          {activePanel === 'search' && <SearchPanel />}
          {activePanel === 'files' && <FilesPanel />}
          {activePanel === 'autonomous' && <AutonomousPanel />}
          {activePanel === 'settings' && <SettingsPanel />}
        </div>
      </main>
    </div>
  )
}

export default App
