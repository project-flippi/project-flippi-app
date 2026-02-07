import React from 'react';
import useServiceStatus from '../hooks/useServiceStatus';

const colorMap: Record<'green' | 'yellow' | 'red' | 'gray', string> = {
  green: '#2ecc71',
  yellow: '#f1c40f',
  red: '#e74c3c',
  gray: '#7f8c8d',
};

function StatusLight({
  state,
}: {
  state: 'green' | 'yellow' | 'red' | 'gray';
}) {
  const color = colorMap[state];

  return (
    <span
      aria-label={`status-${state}`}
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: 999,
        backgroundColor: color,
        marginRight: 8,
        boxShadow: '0 0 4px rgba(0,0,0,0.6)',
      }}
    />
  );
}

function getObsState(
  processRunning: boolean,
  websocket: string,
): 'green' | 'yellow' | 'red' | 'gray' {
  if (!processRunning) return 'gray';
  if (websocket === 'connected') return 'green';
  if (websocket === 'auth_failed' || websocket === 'error') return 'red';
  return 'yellow'; // connecting or running but not connected yet
}

export default function StatusBar() {
  const status = useServiceStatus();

  const obsState = getObsState(status.obs.processRunning, status.obs.websocket);

  let obsText: string;

  if (!status.obs.processRunning) {
    obsText = 'Not running';
  } else if (status.obs.websocket === 'connected') {
    obsText = 'Connected';
  } else if (status.obs.websocket === 'connecting') {
    obsText = 'Connecting…';
  } else if (status.obs.websocket === 'auth_failed') {
    obsText = 'Auth failed';
  } else if (status.obs.websocket === 'error') {
    obsText = 'Connection error';
  } else {
    // websocket === 'unknown' or 'disconnected'
    obsText = 'Running (awaiting connection)';
  }

  return (
    <div
      className="pf-card pf-status-bar"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '10px 16px',
        borderRadius: 0,
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        zIndex: 9999,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatusLight state={obsState} />
        <strong style={{ marginRight: 8 }}>OBS</strong>
        <span>{obsText}</span>

        {status.obs.lastError && (
          <span className="pf-status-message" style={{ marginLeft: 12 }}>
            {status.obs.lastError}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatusLight state={status.clippi.processRunning ? 'green' : 'gray'} />
        <strong style={{ marginRight: 8 }}>Clippi</strong>
        <span>{status.clippi.processRunning ? 'Running' : 'Not running'}</span>
      </div>
    </div>
  );
}
