import { useCallback, useEffect, useState } from 'react';
import type { GameEntry } from '../../../common/meleeTypes';
import GameCard from '../../components/video/GameCard';

function VideoManagementPanel() {
  const [events, setEvents] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [games, setGames] = useState<GameEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState('');

  useEffect(() => {
    window.flippiEvents
      .list()
      .then((list) => {
        setEvents(list);
        if (list.length > 0 && !selectedEvent) {
          setSelectedEvent(list[0]);
        }
        return undefined;
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGames = useCallback(async (eventName: string) => {
    if (!eventName) return;
    setIsLoading(true);
    setError('');
    try {
      const entries = await window.flippiVideo.getGameEntries(eventName);
      setGames(entries);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load games');
      setGames([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      loadGames(selectedEvent);
    }
  }, [selectedEvent, loadGames]);

  async function handlePairGameVideos() {
    if (!selectedEvent) return;
    setActionBusy(true);
    setActionStatus('Pairing game videos with SLP files...');
    try {
      const res = await window.flippiVideo.pairGameVideos(selectedEvent);
      setActionStatus(res.message);
      if (res.ok) loadGames(selectedEvent);
    } catch (err: any) {
      setActionStatus(err?.message ?? 'Failed');
    } finally {
      setActionBusy(false);
      setTimeout(() => setActionStatus(''), 5000);
    }
  }

  return (
    <section className="pf-section">
      <h1>Video Management</h1>

      <div className="pf-card" style={{ maxWidth: 900 }}>
        <div className="pf-field">
          <label htmlFor="video-event-select">
            Event
            <select
              id="video-event-select"
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              disabled={events.length === 0}
              style={{ minWidth: 260 }}
            >
              {events.length === 0 && <option value="">No events</option>}
              {events.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="pf-tabs">
          <button type="button" className="pf-tab pf-tab--active">
            Games ({games.length})
          </button>
        </div>

        {isLoading && (
          <div className="pf-status-message" style={{ marginTop: 8 }}>
            Loading...
          </div>
        )}
        {error && (
          <div className="pf-status-message" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}

        {!isLoading && games.length === 0 && !error && (
          <div style={{ padding: '16px 0', color: '#777' }}>
            No video files found for this event.
          </div>
        )}

        {!isLoading && (
          <div style={{ marginTop: 8 }}>
            {games.map((game) => (
              <GameCard key={game.video.filePath} game={game} />
            ))}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            className="pf-button pf-button-primary"
            onClick={handlePairGameVideos}
            disabled={actionBusy || !selectedEvent}
          >
            Pair Game Videos with SLP data files
          </button>
          {actionStatus && (
            <span className="pf-status-message" style={{ marginLeft: 12 }}>
              {actionStatus}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

export default VideoManagementPanel;
