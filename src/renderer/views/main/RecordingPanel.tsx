import React, { useCallback, useEffect, useState } from 'react';
import useServiceStatus from '../../hooks/useServiceStatus';
import WarningBanner from '../../components/WarningBanner';

function getClippiConnectionWarning(
  obsConnected: boolean | null,
  slippiConnected: boolean | null,
): string {
  if (obsConnected === false && slippiConnected === false) {
    return 'not connected to OBS or Slippi';
  }
  if (obsConnected === false) return 'not connected to OBS';
  return 'not connected to Slippi';
}

function getButtonLabel(busy: boolean, running: boolean): string {
  if (busy) {
    return running ? 'Stopping…' : 'Starting…';
  }
  return running ? 'End Recording Stack' : 'Start Recording Stack';
}

function RecordingPanel() {
  const [events, setEvents] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');

  // Create-event modal state
  const [showCreate, setShowCreate] = useState(false);
  const [eventTitle, setEventTitle] = useState('');

  const [stackStatus, setStackStatus] = useState<string>('');
  const [stackBusy, setStackBusy] = useState(false);

  // Stack options — close apps on stop
  const [closeOnStop, setCloseOnStop] = useState({
    obs: true,
    clippi: true,
    slippi: true,
  });

  // OBS action options
  const [obsOptions, setObsOptions] = useState({
    enableReplayBuffer: true,
    startRecording: false,
    startStreaming: false,
  });

  // Source selector state
  const [obsSources, setObsSources] = useState<
    { name: string; type: string; typeId: string }[]
  >([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedPlayerCamSource, setSelectedPlayerCamSource] =
    useState<string>('');

  // Get persistent stack state from main process
  const { stack, clippi, slippi, obs } = useServiceStatus();
  const { running: stackRunning, currentEventName } = stack;
  const showObsWarning = stackRunning && !obs.processRunning;
  const showClippiWarning = stackRunning && !clippi.processRunning;
  const showClippiConnectionWarning =
    stackRunning &&
    clippi.processRunning &&
    (clippi.obsConnected === false || clippi.slippiConnected === false);
  const showSlippiWarning = stackRunning && !slippi.processRunning;
  const showGameCaptureWarning =
    stackRunning &&
    obs.processRunning &&
    (obs.gameCapture === 'monitoring' || obs.gameCapture === 'inactive');
  const obsConnectedNow = obs.websocket === 'connected';

  const fetchObsSources = useCallback(async (retries = 3) => {
    try {
      const sources = await window.flippiObs.getSources();
      if (sources.length === 0 && retries > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });
        return fetchObsSources(retries - 1);
      }
      setObsSources(sources);
    } catch {
      setObsSources([]);
    }
    return undefined;
  }, []);

  // Load saved settings on mount
  useEffect(() => {
    window.flippiSettings
      .get()
      .then((s) => {
        setCloseOnStop({
          obs: s.closeObsOnStop ?? true,
          clippi: s.closeClippiOnStop ?? true,
          slippi: s.closeSlippiOnStop ?? true,
        });
        setSelectedSource(s.obs.gameCaptureSource || '');
        setSelectedPlayerCamSource(s.obs.playerCameraSource || '');
        setObsOptions({
          enableReplayBuffer: s.obs.enableReplayBuffer ?? true,
          startRecording: s.obs.startRecording ?? false,
          startStreaming: s.obs.startStreaming ?? false,
        });
        return undefined;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (obsConnectedNow) {
      fetchObsSources();
    } else {
      setObsSources([]);
    }
  }, [obsConnectedNow, fetchObsSources]);

  async function onSourceChange(value: string) {
    setSelectedSource(value);
    await window.flippiSettings.update({ obs: { gameCaptureSource: value } });
  }

  async function onPlayerCamSourceChange(value: string) {
    setSelectedPlayerCamSource(value);
    await window.flippiSettings.update({
      obs: { playerCameraSource: value },
    });
  }

  // Auto-reset selected sources if they no longer exist in OBS
  useEffect(() => {
    if (obsSources.length > 0) {
      if (
        selectedSource &&
        !obsSources.some((s) => s.name === selectedSource)
      ) {
        onSourceChange('');
      }
      if (
        selectedPlayerCamSource &&
        !obsSources.some((s) => s.name === selectedPlayerCamSource)
      ) {
        onPlayerCamSourceChange('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obsSources]);

  async function onObsOptionChange(
    option: 'enableReplayBuffer' | 'startRecording' | 'startStreaming',
    value: boolean,
  ) {
    // Always persist the setting
    setObsOptions((cur) => ({ ...cur, [option]: value }));
    await window.flippiSettings.update({ obs: { [option]: value } });

    // If the stack is running, send the command to OBS.
    // The live OBS status polling drives the checkbox state, so no
    // manual revert is needed — the next status update will correct it.
    if (stackRunning && obsConnectedNow) {
      const featureMap = {
        enableReplayBuffer: 'replayBuffer',
        startRecording: 'recording',
        startStreaming: 'streaming',
      } as const;
      await window.flippiObs
        .setFeature(featureMap[option], value)
        .catch(() => {});
    }
  }

  async function refreshEvents(selectIfMissing?: string) {
    const list = await window.flippiEvents.list();
    setEvents(list);
    setSelectedEvent((prev) => {
      if (selectIfMissing && list.includes(selectIfMissing))
        return selectIfMissing;
      if (prev && list.includes(prev)) return prev;
      return list[0] ?? '';
    });
  }

  useEffect(() => {
    refreshEvents().catch((e) => setError(e?.message ?? String(e)));
  }, []);

  // Sync selectedEvent with currentEventName when stack is running
  useEffect(() => {
    if (stackRunning && currentEventName && events.includes(currentEventName)) {
      setSelectedEvent(currentEventName);
    }
  }, [stackRunning, currentEventName, events]);

  const hasEvents = events.length > 0;

  function openCreate() {
    setError('');
    setShowCreate(true);
    setEventTitle('');
  }

  function cancelCreate() {
    setShowCreate(false);
    setEventTitle('');
  }

  async function submitCreate() {
    setError('');

    const trimmedTitle = eventTitle.trim();

    if (!trimmedTitle) {
      setError('Please enter an Event Title.');
      return;
    }

    setBusy(true);
    try {
      const created = await window.flippiEvents.create(trimmedTitle);
      await refreshEvents(created.eventName);
      setShowCreate(false);
      setEventTitle('');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onStartStack() {
    if (!selectedEvent) {
      setStackStatus('Select an event first.');
      return;
    }

    setStackBusy(true);
    setStackStatus('Starting stack…');

    try {
      const res = await window.flippiStack.start(selectedEvent);
      setStackStatus(res.message);
    } catch (e: any) {
      setStackStatus(e?.message ?? String(e));
    } finally {
      setStackBusy(false);
    }
  }

  async function onStopStack() {
    setStackBusy(true);
    setStackStatus('Stopping stack…');

    try {
      const res = await window.flippiStack.stop();
      setStackStatus(res.message);
      if (res.warnings && res.warnings.length > 0) {
        setStackStatus(`${res.message} (${res.warnings.join(', ')})`);
      }
    } catch (e: any) {
      setStackStatus(e?.message ?? String(e));
    } finally {
      setStackBusy(false);
    }
  }

  async function onEventChange(newEvent: string) {
    setSelectedEvent(newEvent);

    // If stack is running, switch to the new event
    if (stackRunning && newEvent !== currentEventName) {
      setStackBusy(true);
      setStackStatus('Switching event…');

      try {
        const res = await window.flippiStack.switch(newEvent);
        setStackStatus(res.message);
      } catch (e: any) {
        setStackStatus(e?.message ?? String(e));
      } finally {
        setStackBusy(false);
      }
    }
  }

  return (
    <section className="pf-section">
      <h1>Recording</h1>

      <div className="pf-card" style={{ maxWidth: 720 }}>
        <div className="pf-field">
          <label htmlFor="active-event-select">
            Create / Select Event
            <div className="pf-settings-actions">
              <button
                type="button"
                className="pf-button pf-button-primary"
                onClick={openCreate}
                disabled={busy}
              >
                Create new event folder
              </button>

              <select
                id="active-event-select"
                value={selectedEvent}
                onChange={(e) => onEventChange(e.target.value)}
                disabled={!hasEvents || busy || stackBusy}
                style={{ minWidth: 260 }}
              >
                {events.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className={`pf-button ${stackRunning ? 'pf-button-danger' : 'pf-button-primary'}`}
                onClick={stackRunning ? onStopStack : onStartStack}
                disabled={stackBusy || busy || !selectedEvent}
              >
                {getButtonLabel(stackBusy, stackRunning)}
              </button>

              {stackStatus && (
                <span className="pf-status-message">{stackStatus}</span>
              )}
            </div>
            {showObsWarning && (
              <WarningBanner
                message="OBS is not running — recording, replay buffer, and streaming are unavailable."
                actionLabel="Relaunch OBS"
                actionBusyLabel="Relaunching…"
                onAction={() => window.flippiStack.relaunchObs()}
                onError={setStackStatus}
              />
            )}
            {showClippiWarning && (
              <WarningBanner
                message="Project Clippi is not running — combo data and replays are not being captured."
                actionLabel="Relaunch Clippi"
                actionBusyLabel="Relaunching…"
                onAction={() => window.flippiStack.relaunchClippi()}
                onError={setStackStatus}
              />
            )}
            {showClippiConnectionWarning && (
              <WarningBanner
                message={`Clippi is running but ${getClippiConnectionWarning(clippi.obsConnected, clippi.slippiConnected)} \u2014 combo data and replays may not be captured.`}
              />
            )}
            {showSlippiWarning && (
              <WarningBanner
                message="Slippi Launcher is not running."
                actionLabel="Relaunch Slippi"
                actionBusyLabel="Relaunching…"
                onAction={() => window.flippiStack.relaunchSlippi()}
                onError={setStackStatus}
              />
            )}
            {showGameCaptureWarning && (
              <WarningBanner
                message={
                  obs.gameCapture === 'inactive'
                    ? 'Game capture signal lost — check Slippi Dolphin and OBS.'
                    : 'Awaiting game capture — ensure game capture source is correct and restart Slippi Dolphin.'
                }
              />
            )}
            <div className="pf-note">
              Select the active event folder to use for recording.
            </div>
          </label>
        </div>

        <div className="pf-field" style={{ marginTop: 12 }}>
          <label htmlFor="game-capture-source-select">
            Game Capture Source
            <div className="pf-settings-actions">
              {obsConnectedNow ? (
                <select
                  id="game-capture-source-select"
                  value={selectedSource}
                  onChange={(e) => onSourceChange(e.target.value)}
                  onMouseDown={() => fetchObsSources()}
                  style={{ minWidth: 260 }}
                >
                  <option value="">None (disabled)</option>
                  {obsSources.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="pf-status-message">
                  Connect to OBS to see available sources
                </span>
              )}
            </div>
            <div className="pf-note">
              Select the OBS source to monitor for game capture detection.
            </div>
          </label>
        </div>

        <div className="pf-field" style={{ marginTop: 12 }}>
          <label htmlFor="player-camera-source-select">
            Player Camera Source
            <div className="pf-settings-actions">
              {obsConnectedNow ? (
                <select
                  id="player-camera-source-select"
                  value={selectedPlayerCamSource}
                  onChange={(e) => onPlayerCamSourceChange(e.target.value)}
                  onMouseDown={() => fetchObsSources()}
                  style={{ minWidth: 260 }}
                >
                  <option value="">None (disabled)</option>
                  {obsSources.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="pf-status-message">
                  Connect to OBS to see available sources
                </span>
              )}
            </div>
            <div className="pf-note">
              Select the OBS source for the player camera (used for short-form
              video reformatting).
            </div>
          </label>
        </div>

        <div className="pf-field" style={{ marginTop: 12 }}>
          <span>OBS Actions</span>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginTop: 4,
            }}
          >
            <label
              htmlFor="obs-opt-replay-buffer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 'normal',
                cursor: 'pointer',
              }}
            >
              <input
                id="obs-opt-replay-buffer"
                type="checkbox"
                checked={
                  stackRunning && obsConnectedNow
                    ? obs.replayBufferActive
                    : obsOptions.enableReplayBuffer
                }
                onChange={(e) =>
                  onObsOptionChange('enableReplayBuffer', e.target.checked)
                }
              />
              Enable Replay Buffer
            </label>
            <label
              htmlFor="obs-opt-recording"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 'normal',
                cursor: 'pointer',
              }}
            >
              <input
                id="obs-opt-recording"
                type="checkbox"
                checked={
                  stackRunning && obsConnectedNow
                    ? obs.recording
                    : obsOptions.startRecording
                }
                onChange={(e) =>
                  onObsOptionChange('startRecording', e.target.checked)
                }
              />
              Start Recording
            </label>
            <label
              htmlFor="obs-opt-streaming"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 'normal',
                cursor: 'pointer',
              }}
            >
              <input
                id="obs-opt-streaming"
                type="checkbox"
                checked={
                  stackRunning && obsConnectedNow
                    ? obs.streaming
                    : obsOptions.startStreaming
                }
                onChange={(e) =>
                  onObsOptionChange('startStreaming', e.target.checked)
                }
              />
              Start Streaming
            </label>
          </div>
          <div className="pf-note" style={{ marginTop: 4 }}>
            Choose what OBS does when the recording stack starts. Changes apply
            immediately if the stack is already running.
          </div>
        </div>

        <div className="pf-field" style={{ marginTop: 12 }}>
          <span>Close on Stop</span>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginTop: 4,
            }}
          >
            {(
              [
                ['obs', 'closeObsOnStop', 'OBS'],
                ['clippi', 'closeClippiOnStop', 'Project Clippi'],
                ['slippi', 'closeSlippiOnStop', 'Slippi Launcher'],
              ] as const
            ).map(([key, settingKey, label]) => (
              <label
                key={key}
                htmlFor={`stack-opt-close-${key}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontWeight: 'normal',
                  cursor: 'pointer',
                }}
              >
                <input
                  id={`stack-opt-close-${key}`}
                  type="checkbox"
                  checked={closeOnStop[key]}
                  onChange={async (e) => {
                    const value = e.target.checked;
                    setCloseOnStop((cur) => ({ ...cur, [key]: value }));
                    await window.flippiSettings.update({
                      [settingKey]: value,
                    });
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="pf-note" style={{ marginTop: 4 }}>
            Choose which apps to close when the recording stack stops.
          </div>
        </div>

        {showCreate && (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div className="pf-video-modal-overlay" onClick={cancelCreate}>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
              className="pf-new-set-form"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ margin: '0 0 4px' }}>Create Event Folder</h2>
              <p
                style={{
                  margin: '0 0 16px',
                  fontSize: 13,
                  color: '#94a3b8',
                }}
              >
                Creates a new event folder and initializes event metadata.
              </p>

              <div className="pf-field">
                <label htmlFor="event-title-input">
                  Event Title
                  <input
                    id="event-title-input"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !busy) submitCreate();
                    }}
                    placeholder="Golden Cactus Weeklies"
                    disabled={busy}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                  />
                </label>
              </div>

              <div className="pf-settings-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="pf-button pf-button-primary"
                  onClick={submitCreate}
                  disabled={busy}
                >
                  {busy ? 'Creating…' : 'Create'}
                </button>

                <button
                  type="button"
                  className="pf-button"
                  onClick={cancelCreate}
                  disabled={busy}
                >
                  Cancel
                </button>

                {error && <span className="pf-status-message">{error}</span>}
              </div>
            </div>
          </div>
        )}

        {!showCreate && error && (
          <div className="pf-status-message" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}

        {!hasEvents && !error && (
          <div className="pf-status-message" style={{ marginTop: 10 }}>
            No event folders found yet. Create one to get started.
          </div>
        )}
      </div>
    </section>
  );
}

export default RecordingPanel;
