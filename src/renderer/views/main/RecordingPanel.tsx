import React, { useEffect, useState } from 'react';
import useServiceStatus from '../../hooks/useServiceStatus';

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

  // NEW: form state
  const [showCreate, setShowCreate] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [venueDesc, setVenueDesc] = useState('');

  const [stackStatus, setStackStatus] = useState<string>('');
  const [stackBusy, setStackBusy] = useState(false);

  const [relaunchBusy, setRelaunchBusy] = useState(false);
  const [relaunchSlippiBusy, setRelaunchSlippiBusy] = useState(false);

  // OBS action options
  const [obsOptions, setObsOptions] = useState({
    enableReplayBuffer: true,
    startRecording: false,
    startStreaming: false,
  });

  // Game capture source selector state
  const [obsSources, setObsSources] = useState<
    { name: string; type: string; typeId: string }[]
  >([]);
  const [selectedSource, setSelectedSource] = useState<string>('');

  // Get persistent stack state from main process
  const { stack, clippi, slippi, obs } = useServiceStatus();
  const { running: stackRunning, currentEventName } = stack;
  const showClippiWarning = stackRunning && !clippi.processRunning;
  const showClippiConnectionWarning =
    stackRunning &&
    clippi.processRunning &&
    (clippi.obsConnected === false || clippi.slippiConnected === false);
  const showSlippiWarning = stackRunning && !slippi.processRunning;
  const showGameCaptureWarning =
    stackRunning &&
    (obs.gameCapture === 'monitoring' || obs.gameCapture === 'inactive');
  const obsConnectedNow = obs.websocket === 'connected';

  async function fetchObsSources(retries = 3) {
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
  }

  // Load saved settings on mount
  useEffect(() => {
    window.flippiSettings
      .get()
      .then((s) => {
        setSelectedSource(s.obs.gameCaptureSource || '');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obsConnectedNow]);

  async function onSourceChange(value: string) {
    setSelectedSource(value);
    await window.flippiSettings.update({ obs: { gameCaptureSource: value } });
  }

  // Auto-reset selected source if it no longer exists in OBS
  useEffect(() => {
    if (
      obsSources.length > 0 &&
      selectedSource &&
      !obsSources.some((s) => s.name === selectedSource)
    ) {
      onSourceChange('');
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
    if (stackRunning) {
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
    setVenueDesc('');
  }

  function cancelCreate() {
    setShowCreate(false);
    setEventTitle('');
    setVenueDesc('');
  }

  async function submitCreate() {
    setError('');

    const trimmedTitle = eventTitle.trim();
    const trimmedVenue = venueDesc.trim();

    if (!trimmedTitle) {
      setError('Please enter an Event Title.');
      return;
    }
    if (!trimmedVenue) {
      setError('Please enter a Venue Description.');
      return;
    }

    setBusy(true);
    try {
      const created = await window.flippiEvents.create(
        trimmedTitle,
        trimmedVenue,
      );
      await refreshEvents(created.eventName);
      setShowCreate(false);
      setEventTitle('');
      setVenueDesc('');
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
            {showClippiWarning && (
              <div
                style={{
                  borderLeft: '4px solid #e5a000',
                  background: '#fef9ec',
                  padding: '8px 12px',
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 4,
                  color: '#7a5d00',
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1 }}>
                  Project Clippi is not running — combo data and replays are not
                  being captured.
                </span>
                <button
                  type="button"
                  className="pf-button pf-button-primary"
                  style={{ whiteSpace: 'nowrap', fontSize: 13 }}
                  disabled={relaunchBusy}
                  onClick={async () => {
                    setRelaunchBusy(true);
                    try {
                      const res = await window.flippiStack.relaunchClippi();
                      if (!res.ok) {
                        setStackStatus(res.message);
                      }
                    } catch (e: any) {
                      setStackStatus(e?.message ?? String(e));
                    } finally {
                      setRelaunchBusy(false);
                    }
                  }}
                >
                  {relaunchBusy ? 'Relaunching…' : 'Relaunch Clippi'}
                </button>
              </div>
            )}
            {showClippiConnectionWarning && (
              <div
                style={{
                  borderLeft: '4px solid #e5a000',
                  background: '#fef9ec',
                  padding: '8px 12px',
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 4,
                  color: '#7a5d00',
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1 }}>
                  Clippi is running but{' '}
                  {getClippiConnectionWarning(
                    clippi.obsConnected,
                    clippi.slippiConnected,
                  )}
                  {' \u2014 combo data and replays may not be captured.'}
                </span>
              </div>
            )}
            {showSlippiWarning && (
              <div
                style={{
                  borderLeft: '4px solid #e5a000',
                  background: '#fef9ec',
                  padding: '8px 12px',
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 4,
                  color: '#7a5d00',
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1 }}>Slippi Launcher is not running.</span>
                <button
                  type="button"
                  className="pf-button pf-button-primary"
                  style={{ whiteSpace: 'nowrap', fontSize: 13 }}
                  disabled={relaunchSlippiBusy}
                  onClick={async () => {
                    setRelaunchSlippiBusy(true);
                    try {
                      const res = await window.flippiStack.relaunchSlippi();
                      if (!res.ok) {
                        setStackStatus(res.message);
                      }
                    } catch (e: any) {
                      setStackStatus(e?.message ?? String(e));
                    } finally {
                      setRelaunchSlippiBusy(false);
                    }
                  }}
                >
                  {relaunchSlippiBusy ? 'Relaunching…' : 'Relaunch Slippi'}
                </button>
              </div>
            )}
            {showGameCaptureWarning && (
              <div
                style={{
                  borderLeft: '4px solid #e5a000',
                  background: '#fef9ec',
                  padding: '8px 12px',
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 4,
                  color: '#7a5d00',
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1 }}>
                  {obs.gameCapture === 'inactive'
                    ? 'Game capture signal lost — check Slippi Dolphin and OBS.'
                    : 'Awaiting game capture — ensure game capture source is correct and restart Slippi Dolphin.'}
                </span>
              </div>
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
                  stackRunning
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
                  stackRunning ? obs.recording : obsOptions.startRecording
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
                  stackRunning ? obs.streaming : obsOptions.startStreaming
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

        {showCreate && (
          <div className="pf-card" style={{ marginTop: 12 }}>
            <div className="pf-card-header">
              <h2>Create Event Folder</h2>
              <p>
                Creates a new folder from <code>_EventTemplate</code> and writes
                event metadata.
              </p>
            </div>

            <div className="pf-field">
              <label htmlFor="event-title-input">
                Event Title
                <input
                  id="event-title-input"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Golden Cactus Weeklies"
                  disabled={busy}
                />
              </label>
            </div>

            <div className="pf-field">
              <label htmlFor="venue-desc-input">
                Venue Description
                <input
                  id="venue-desc-input"
                  value={venueDesc}
                  onChange={(e) => setVenueDesc(e.target.value)}
                  placeholder="Golden Cactus Brewery — Monday Night Melee"
                  disabled={busy}
                />
                <div className="pf-note">
                  Used for overlays/thumbnails; keep it short.
                </div>
              </label>
            </div>

            <div className="pf-settings-actions">
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
