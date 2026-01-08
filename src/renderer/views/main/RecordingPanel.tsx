import React, { useEffect, useState } from 'react';

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
                onChange={(e) => setSelectedEvent(e.target.value)}
                disabled={!hasEvents || busy}
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
                className="pf-button pf-button-primary"
                onClick={onStartStack}
                disabled={stackBusy || busy || !selectedEvent}
              >
                {stackBusy ? 'Starting…' : 'Start Recording Stack'}
              </button>

              {stackStatus && (
                <span className="pf-status-message">{stackStatus}</span>
              )}
            </div>
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
