import React from 'react';
import { Toaster } from 'sonner';
import MainPanel from './views/main/MainPanel';
import StatusBar from './components/StatusBar';

function App() {
  return (
    <div className="pf-app-shell">
      <MainPanel />
      <StatusBar />
      <Toaster
        position="top-right"
        duration={5000}
        toastOptions={{
          style: {
            background: 'var(--pf-bg-elevated)',
            color: 'var(--pf-text-primary)',
            border: '1px solid var(--pf-border-control)',
            borderRadius: 8,
          },
        }}
      />
    </div>
  );
}

export default App;
