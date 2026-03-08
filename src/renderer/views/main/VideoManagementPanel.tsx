import { useCallback, useEffect, useState } from 'react';
import useVideoData from '../../hooks/useVideoData';
import ClipsView from './ClipsView';
import CompilationsView from './CompilationsView';

type Tab = 'clips' | 'compilations';

function VideoManagementPanel() {
  const [events, setEvents] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('clips');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState('');

  const { clips, compilations, isLoading, error, loadClips, loadCompilations } =
    useVideoData();

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

  useEffect(() => {
    if (selectedEvent) {
      loadClips(selectedEvent);
      loadCompilations(selectedEvent);
    }
  }, [selectedEvent, loadClips, loadCompilations]);

  const showClips = useCallback(() => setActiveTab('clips'), []);
  const showCompilations = useCallback(() => setActiveTab('compilations'), []);

  const refresh = useCallback(() => {
    if (selectedEvent) {
      loadClips(selectedEvent);
      loadCompilations(selectedEvent);
    }
  }, [selectedEvent, loadClips, loadCompilations]);

  async function handleGenerateClipData() {
    if (!selectedEvent) return;
    setActionBusy(true);
    setActionStatus('Generating clip data...');
    try {
      const res = await window.flippiVideo.generateClipData(selectedEvent);
      setActionStatus(res.message);
      if (res.ok) refresh();
    } catch (err: any) {
      setActionStatus(err?.message ?? 'Failed');
    } finally {
      setActionBusy(false);
      setTimeout(() => setActionStatus(''), 5000);
    }
  }

  async function handlePairVideoFiles() {
    if (!selectedEvent) return;
    setActionBusy(true);
    setActionStatus('Pairing video files...');
    try {
      const res = await window.flippiVideo.pairVideoFiles(selectedEvent);
      setActionStatus(
        res.ok
          ? `Paired ${res.paired} clips (${res.unmatched} unmatched).`
          : 'Failed to pair video files.',
      );
      if (res.ok) refresh();
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

        <div className="pf-settings-actions" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="pf-button pf-button-primary"
            onClick={handleGenerateClipData}
            disabled={actionBusy || !selectedEvent}
          >
            Create Clip Data
          </button>
          <button
            type="button"
            className="pf-button"
            onClick={handlePairVideoFiles}
            disabled={actionBusy || !selectedEvent}
          >
            Pair Video Files
          </button>
          <button
            type="button"
            className="pf-button"
            onClick={refresh}
            disabled={isLoading || !selectedEvent}
          >
            Refresh
          </button>
          {actionStatus && (
            <span className="pf-status-message">{actionStatus}</span>
          )}
        </div>

        <div className="pf-tabs">
          <button
            type="button"
            className={`pf-tab ${activeTab === 'clips' ? 'pf-tab--active' : ''}`}
            onClick={showClips}
          >
            Clips ({clips.length})
          </button>
          <button
            type="button"
            className={`pf-tab ${activeTab === 'compilations' ? 'pf-tab--active' : ''}`}
            onClick={showCompilations}
          >
            Compilations ({compilations.length})
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

        {!isLoading && activeTab === 'clips' && (
          <ClipsView
            clips={clips}
            compilations={compilations}
            eventName={selectedEvent}
            onUpdated={refresh}
          />
        )}
        {!isLoading && activeTab === 'compilations' && (
          <CompilationsView
            compilations={compilations}
            eventName={selectedEvent}
            onUpdated={refresh}
          />
        )}
      </div>
    </section>
  );
}

export default VideoManagementPanel;
