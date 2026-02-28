import React from 'react';
import { Toaster } from 'sonner';
import MainPanel from './views/main/MainPanel';
import StatusBar from './components/StatusBar';

function App() {
  return (
    <>
      <MainPanel />
      <StatusBar />
      <Toaster
        position="top-right"
        duration={5000}
        toastOptions={{
          style: {
            background: '#0f172a',
            color: '#e5e7eb',
            border: '1px solid #334155',
            borderRadius: 8,
          },
        }}
      />
    </>
  );
}

export default App;
