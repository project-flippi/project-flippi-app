// src/renderer/views/MainPanel/MainPanel.tsx
import React, { useState } from 'react';
import '../../styles/main.css';
import SettingsPanel from './SettingsPanel';
import RecordingPanel from './RecordingPanel';

type View = 'recording' | 'videos' | 'schedule' | 'settings';

function VideoManagementPlaceholder() {
  return (
    <section className="pf-section">
      <h1>Video Management</h1>
      <p>
        Here you&apos;ll browse events, games, clips, sets and compilations, and
        manage metadata.
      </p>
    </section>
  );
}

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
          <div className="pf-subtitle">Tournament Toolkit</div>
        </div>

        <nav className="pf-nav">
          <button
            type="button"
            className={navButtonClass(activeView, 'recording')}
            onClick={() => setActiveView('recording')}
          >
            Recording
          </button>
          <button
            type="button"
            className={navButtonClass(activeView, 'videos')}
            onClick={() => setActiveView('videos')}
          >
            Video Management
          </button>
          <button
            type="button"
            className={navButtonClass(activeView, 'schedule')}
            onClick={() => setActiveView('schedule')}
          >
            Scheduling
          </button>
          <button
            type="button"
            className={navButtonClass(activeView, 'settings')}
            onClick={() => setActiveView('settings')}
          >
            Settings
          </button>
        </nav>

        <div className="pf-sidebar-footer">
          <span className="pf-footer-text">Project Flippi</span>
          <span className="pf-footer-subtext">Melee Recording & Content</span>
        </div>
      </aside>

      <main className="pf-main">
        {activeView === 'recording' && <RecordingPanel />}
        {activeView === 'videos' && <VideoManagementPlaceholder />}
        {activeView === 'schedule' && <SchedulingPlaceholder />}
        {activeView === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}

export default MainPanel;
