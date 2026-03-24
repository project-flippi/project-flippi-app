import React from 'react';
import type {
  ClippiServiceStatus,
  GameCaptureState,
  SlippiServiceStatus,
} from '../../common/statusTypes';
import useServiceStatus from '../hooks/useServiceStatus';
import useStackToasts from '../hooks/useStackToasts';
import { ReactComponent as ObsLogo } from '../styles/images/obs-logo.svg';
import { ReactComponent as ClippiLogo } from '../styles/images/clippi-logo.svg';
import { ReactComponent as SlippiLogo } from '../styles/images/slippi-logo.svg';

const colorMap: Record<'green' | 'yellow' | 'red' | 'gray', string> = {
  green: 'var(--pf-success-light)',
  yellow: 'var(--pf-warning-light)',
  red: 'var(--pf-danger-light)',
  gray: 'var(--pf-inactive)',
};

function StatusLight({
  state,
  label,
}: {
  state: 'green' | 'yellow' | 'red' | 'gray';
  label: string;
}) {
  const color = colorMap[state];

  return (
    <span
      role="status"
      aria-label={label}
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
  gameCapture: GameCaptureState,
): 'green' | 'yellow' | 'red' | 'gray' {
  if (!processRunning) return 'gray';
  if (websocket === 'auth_failed' || websocket === 'error') return 'red';
  if (websocket === 'connected') {
    if (gameCapture === 'monitoring' || gameCapture === 'inactive')
      return 'yellow';
    return 'green';
  }
  return 'yellow'; // connecting or running but not connected yet
}

function getClippiState(
  clippi: ClippiServiceStatus,
): 'green' | 'yellow' | 'gray' {
  if (!clippi.processRunning) return 'gray';
  if (clippi.obsConnected === true && clippi.slippiConnected === true)
    return 'green';
  if (clippi.obsConnected === null && clippi.slippiConnected === null)
    return 'yellow'; // still loading / no file yet
  // At least one is explicitly false
  return 'yellow';
}

function getClippiText(clippi: ClippiServiceStatus): string {
  if (!clippi.processRunning) return 'Not running';
  if (clippi.obsConnected === null && clippi.slippiConnected === null)
    return 'Running (checking connections\u2026)';
  const missing: string[] = [];
  if (clippi.obsConnected === false) missing.push('OBS');
  if (clippi.slippiConnected === false) missing.push('Slippi');
  if (missing.length > 0) return `Missing: ${missing.join(', ')}`;
  return 'Fully connected';
}

function getSlippiState(
  slippi: SlippiServiceStatus,
): 'green' | 'yellow' | 'gray' {
  if (!slippi.processRunning) return 'gray';
  if (slippi.dolphinRunning) return 'green';
  return 'yellow';
}

function getSlippiText(slippi: SlippiServiceStatus): string {
  if (!slippi.processRunning) return 'Not running';
  if (slippi.dolphinRunning) return 'Running (Dolphin active)';
  return 'Running (Dolphin inactive)';
}

export default function StatusBar() {
  const status = useServiceStatus();

  const obsState = getObsState(
    status.obs.processRunning,
    status.obs.websocket,
    status.obs.gameCapture,
  );

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

  const clippiState = getClippiState(status.clippi);
  const slippiState = getSlippiState(status.slippi);

  const isAllGreen =
    obsState === 'green' && clippiState === 'green' && slippiState === 'green';
  useStackToasts(isAllGreen, status.stack.running);

  let gameCaptureText: string | null = null;
  if (status.obs.processRunning) {
    if (status.obs.gameCapture === 'monitoring') {
      gameCaptureText = 'Awaiting game capture';
    } else if (status.obs.gameCapture === 'inactive') {
      gameCaptureText = 'Game capture lost';
    }
  }

  return (
    <div
      className="pf-card pf-status-bar"
      style={{
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatusLight state={obsState} label={`OBS: ${obsText}`} />
        <span title="OBS" aria-hidden="true">
          <ObsLogo style={{ height: 18, width: 'auto', marginRight: 8 }} />
        </span>
        <span>{obsText}</span>

        {gameCaptureText && (
          <span style={{ marginLeft: 8, color: colorMap.yellow, fontSize: 12 }}>
            — {gameCaptureText}
          </span>
        )}

        {status.obs.lastError && (
          <span className="pf-status-message" style={{ marginLeft: 12 }}>
            {status.obs.lastError}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatusLight
          state={clippiState}
          label={`Clippi: ${getClippiText(status.clippi)}`}
        />
        <span title="Clippi" aria-hidden="true">
          <ClippiLogo style={{ height: 18, width: 'auto', marginRight: 8 }} />
        </span>
        <span>{getClippiText(status.clippi)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatusLight
          state={slippiState}
          label={`Slippi: ${getSlippiText(status.slippi)}`}
        />
        <span title="Slippi" aria-hidden="true">
          <SlippiLogo style={{ height: 18, width: 'auto', marginRight: 8 }} />
        </span>
        <span>{getSlippiText(status.slippi)}</span>
      </div>
    </div>
  );
}
