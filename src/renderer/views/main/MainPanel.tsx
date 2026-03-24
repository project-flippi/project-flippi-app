// src/renderer/views/MainPanel/MainPanel.tsx
import React, { useState } from 'react';
import '../../styles/main.css';
import SettingsPanel from './SettingsPanel';
import RecordingPanel from './RecordingPanel';
import VideoManagementPanel from './VideoManagementPanel';

type View = 'recording' | 'videos' | 'schedule' | 'settings';

function SchedulingPlaceholder() {
  return (
    <section className="pf-section">
      <h1>Scheduling</h1>
      <p>
        Configure recurring tasks like data generation, compilation, and YouTube
        uploads.
      </p>
    </section>
  );
}

function navButtonClass(active: View, self: View): string {
  const base = 'pf-nav-button';
  return active === self ? `${base} pf-nav-button--active` : base;
}

function MainPanel() {
  const [activeView, setActiveView] = useState<View>('recording');

  return (
    <div className="pf-app-root">
      <aside className="pf-sidebar">
        <div className="pf-sidebar-header">
          <div className="pf-logo">Flippi</div>
          <div className="pf-subtitle">Content Creation Toolkit</div>
        </div>

        <nav className="pf-nav">
          <button
            type="button"
            className={navButtonClass(activeView, 'recording')}
            onClick={() => setActiveView('recording')}
            data-short="Rec"
            title="Recording"
          >
            Recording
          </button>
          <button
            type="button"
            className={navButtonClass(activeView, 'videos')}
            onClick={() => setActiveView('videos')}
            data-short="Vid"
            title="Video Management"
          >
            Video Management
          </button>
          <button
            type="button"
            className={navButtonClass(activeView, 'schedule')}
            onClick={() => setActiveView('schedule')}
            data-short="Sch"
            title="Scheduling"
          >
            Scheduling
          </button>
          <button
            type="button"
            className={navButtonClass(activeView, 'settings')}
            onClick={() => setActiveView('settings')}
            data-short="Set"
            title="Settings"
          >
            Settings
          </button>
        </nav>
      </aside>

      <main className="pf-main">
        {activeView === 'recording' && <RecordingPanel />}
        {activeView === 'videos' && <VideoManagementPanel />}
        {activeView === 'schedule' && <SchedulingPlaceholder />}
        {activeView === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}

export default MainPanel;
