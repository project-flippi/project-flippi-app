import React from 'react';
import { useServiceStatus } from '../hooks/useServiceStatus';

function StatusLight({ state }: { state: 'green' | 'yellow' | 'red' | 'gray' }) {
  const color =
    state === 'green'
      ? '#2ecc71'
      : state === 'yellow'
        ? '#f1c40f'
        : state === 'red'
          ? '#e74c3c'
          : '#7f8c8d';

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

export default function StatusBar() {
  const status = useServiceStatus();

  const obsOk =
    status.obs.processRunning && status.obs.websocket === 'connected';

  const obsState =
    obsOk
      ? 'green'
      : status.obs.websocket === 'connecting'
        ? 'yellow'
        : status.obs.websocket === 'auth_failed' ||
            status.obs.websocket === 'error'
          ? 'red'
          : 'gray';

  const obsText = obsOk
    ? 'Connected'
    : !status.obs.processRunning
      ? 'Not running'
      : status.obs.websocket.replace('_', ' ');

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
    </div>
  );
}
