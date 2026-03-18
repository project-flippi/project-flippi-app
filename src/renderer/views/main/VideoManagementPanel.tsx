import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameEntry, GameSet, SetEntry } from '../../../common/meleeTypes';
import { computeSetTitle } from '../../../common/setUtils';
import GameCard from '../../components/video/GameCard';
import SetCard from '../../components/video/SetCard';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { List } = require('react-window');

/** Build a video-file-path → setId lookup from the current sets list. */
function buildVideoSetMap(entries: SetEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  entries.forEach((entry) => {
    entry.set.gameVideoFilePaths.forEach((vp) => {
      map.set(vp, entry.set.id);
    });
  });
  return map;
}

const GAME_CARD_HEIGHT = 80;
const SET_CARD_BASE_HEIGHT = 200;
const SET_CARD_GAME_HEIGHT = 60;

interface GameRowProps {
  games: GameEntry[];
  sets: SetEntry[];
  eventName: string;
  videoSetMap: Map<string, string>;
  onSetChanged: () => void;
}

function GameRow({
  index,
  style,
  games,
  sets,
  eventName,
  videoSetMap,
  onSetChanged,
}: {
  index: number;
  style: React.CSSProperties;
} & GameRowProps) {
  const game = games[index];
  return (
    <div style={style}>
      <GameCard
        game={game}
        sets={sets}
        eventName={eventName}
        onSetChanged={onSetChanged}
        currentSetId={videoSetMap.get(game.video.filePath) ?? null}
      />
    </div>
  );
}

interface SetRowProps {
  sets: SetEntry[];
  eventName: string;
  onSetUpdated: (updatedSet: GameSet) => void;
  onGameRemoved: (setId: string, videoFilePath: string) => void;
  onSetDeleted: (setId: string) => void;
}

function SetRow({
  index,
  style,
  sets,
  eventName,
  onSetUpdated,
  onGameRemoved,
  onSetDeleted,
}: {
  index: number;
  style: React.CSSProperties;
} & SetRowProps) {
  const setEntry = sets[index];
  return (
    <div style={style}>
      <SetCard
        setEntry={setEntry}
        eventName={eventName}
        onSetUpdated={onSetUpdated}
        onGameRemoved={onGameRemoved}
        onSetDeleted={onSetDeleted}
      />
    </div>
  );
}

function VideoManagementPanel() {
  const [events, setEvents] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [games, setGames] = useState<GameEntry[]>([]);
  const [sets, setSets] = useState<SetEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'games' | 'sets'>('games');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState('');

  // Derived video -> set lookup (recalculated when sets change)
  const videoSetMap = useMemo(() => buildVideoSetMap(sets), [sets]);

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

  // Combined loader: loads games and sets in a single IPC call
  const loadAll = useCallback(async (eventName: string) => {
    if (!eventName) return;
    setIsLoading(true);
    setError('');
    try {
      const result = await window.flippiVideo.getGameAndSetEntries(eventName);
      setGames(result.games);
      setSets(result.sets);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load games');
      setGames([]);
      setSets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSets = useCallback(async (eventName: string) => {
    if (!eventName) return;
    try {
      const entries = await window.flippiSets.getEntries(eventName);
      setSets(entries);
    } catch {
      setSets([]);
    }
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      loadAll(selectedEvent);
    }
  }, [selectedEvent, loadAll]);

  // -----------------------------------------------------------------------
  // Optimistic update helpers (no full reload)
  // -----------------------------------------------------------------------

  /** Recompute a single SetEntry's title after its GameSet changed. */
  const recomputeEntry = useCallback(
    (entry: SetEntry, updatedSet: GameSet): SetEntry => ({
      set: updatedSet,
      games: entry.games,
      title: computeSetTitle(updatedSet, entry.games, selectedEvent),
    }),
    [selectedEvent],
  );

  /** Called when a set's metadata is updated (dropdowns, player overrides). */
  const handleSetUpdated = useCallback(
    (updatedSet: GameSet) => {
      setSets((prev) =>
        prev.map((entry) =>
          entry.set.id === updatedSet.id
            ? recomputeEntry(entry, updatedSet)
            : entry,
        ),
      );
    },
    [recomputeEntry],
  );

  /** Called when a game is removed from a set. */
  const handleGameRemoved = useCallback(
    (setId: string, videoFilePath: string) => {
      setSets((prev) => {
        const updated = prev
          .map((entry) => {
            if (entry.set.id !== setId) return entry;
            const newGames = entry.games.filter(
              (g) => g.video.filePath !== videoFilePath,
            );
            const newSet = {
              ...entry.set,
              gameVideoFilePaths: entry.set.gameVideoFilePaths.filter(
                (p) => p !== videoFilePath,
              ),
            };
            // If set is now empty, it was deleted server-side
            if (newGames.length === 0) return null;
            return {
              set: newSet,
              games: newGames,
              title: computeSetTitle(newSet, newGames, selectedEvent),
            };
          })
          .filter((e): e is SetEntry => e !== null);
        return updated;
      });
    },
    [selectedEvent],
  );

  /** Called when a set is deleted entirely. */
  const handleSetDeleted = useCallback((setId: string) => {
    setSets((prev) => prev.filter((entry) => entry.set.id !== setId));
  }, []);

  /**
   * Called from the Games tab when a game is added to a set or a new set is
   * created. We do a lightweight reload of sets only (games stay stable).
   */
  const handleSetChanged = useCallback(() => {
    if (selectedEvent) {
      loadSets(selectedEvent);
    }
  }, [selectedEvent, loadSets]);

  async function handlePairGameVideos() {
    if (!selectedEvent) return;
    setActionBusy(true);
    setActionStatus('Pairing game videos with SLP files...');
    try {
      const res = await window.flippiVideo.pairGameVideos(selectedEvent);
      setActionStatus(res.message);
      if (res.ok) {
        loadAll(selectedEvent);
      }
    } catch (err: any) {
      setActionStatus(err?.message ?? 'Failed');
    } finally {
      setActionBusy(false);
      setTimeout(() => setActionStatus(''), 5000);
    }
  }

  const getSetRowHeight = useCallback(
    (index: number) => {
      const entry = sets[index];
      if (!entry) return SET_CARD_BASE_HEIGHT;
      return SET_CARD_BASE_HEIGHT + entry.games.length * SET_CARD_GAME_HEIGHT;
    },
    [sets],
  );

  // Stable rowProps objects for react-window (re-created only when deps change)
  const gameRowProps = useMemo(
    () => ({
      games,
      sets,
      eventName: selectedEvent,
      videoSetMap,
      onSetChanged: handleSetChanged,
    }),
    [games, sets, selectedEvent, videoSetMap, handleSetChanged],
  );

  const setRowProps = useMemo(
    () => ({
      sets,
      eventName: selectedEvent,
      onSetUpdated: handleSetUpdated,
      onGameRemoved: handleGameRemoved,
      onSetDeleted: handleSetDeleted,
    }),
    [
      sets,
      selectedEvent,
      handleSetUpdated,
      handleGameRemoved,
      handleSetDeleted,
    ],
  );

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
          <button
            type="button"
            className={`pf-tab ${activeTab === 'games' ? 'pf-tab--active' : ''}`}
            onClick={() => setActiveTab('games')}
          >
            Games ({games.length})
          </button>
          <button
            type="button"
            className={`pf-tab ${activeTab === 'sets' ? 'pf-tab--active' : ''}`}
            onClick={() => setActiveTab('sets')}
          >
            Sets ({sets.length})
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

        {/* Games tab */}
        {activeTab === 'games' && !isLoading && (
          <>
            {games.length === 0 && !error && (
              <div style={{ padding: '16px 0', color: '#777' }}>
                No video files found for this event.
              </div>
            )}
            {games.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <List
                  style={{ height: 600 }}
                  rowComponent={GameRow}
                  rowCount={games.length}
                  rowHeight={GAME_CARD_HEIGHT}
                  rowProps={gameRowProps}
                  overscanCount={3}
                />
              </div>
            )}
          </>
        )}

        {/* Sets tab */}
        {activeTab === 'sets' && !isLoading && (
          <>
            {sets.length === 0 && (
              <div style={{ padding: '16px 0', color: '#777' }}>
                No sets created yet. Add games to a set from the Games tab.
              </div>
            )}
            {sets.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <List
                  style={{ height: 600 }}
                  rowComponent={SetRow}
                  rowCount={sets.length}
                  rowHeight={getSetRowHeight}
                  rowProps={setRowProps}
                  overscanCount={2}
                />
              </div>
            )}
          </>
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
