import React, { useEffect, useState } from 'react';
import useServiceStatus from '../../hooks/useServiceStatus';

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

  // Get persistent stack state from main process
  const { stack, clippi, slippi } = useServiceStatus();
  const { running: stackRunning, currentEventName } = stack;
  const showClippiWarning = stackRunning && !clippi.processRunning;
  const showSlippiWarning = stackRunning && !slippi.processRunning;

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
            <div className="pf-note">
              Select the active event folder to use for recording.
            </div>
          </label>
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
