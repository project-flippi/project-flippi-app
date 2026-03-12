import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import type {
  SetEntry,
  SetPhase,
  SetType,
  SetRoundType,
  GameSet,
  SetPlayerOverride,
} from '../../../common/meleeTypes';
import { getResolvedPlayers } from '../../../common/setUtils';
import GameMatchInfo from './GameMatchInfo';
import { VideoPlayerModal, localFileUrl, formatFileSize } from './GameCard';
import LazyVideoThumbnail from './LazyVideoThumbnail';

/** Controlled input that saves on blur. Manages its own local state. */
function PlayerOverrideInput({
  setId,
  side,
  initialValue,
  placeholder,
  port,
  onSave,
}: {
  setId: string;
  side: number;
  initialValue: string;
  placeholder: string;
  port: number | undefined;
  onSave: (side: number, name: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <div className="pf-set-player-override">
      <label htmlFor={`set-${setId}-p${side}`}>
        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
          P{side + 1}
          {port != null ? ` (Port ${port})` : ''}
        </span>
        <input
          id={`set-${setId}-p${side}`}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => onSave(side, value)}
          placeholder={placeholder}
          style={{ width: 160, fontSize: '0.85rem' }}
        />
      </label>
    </div>
  );
}

const SET_TYPES: SetType[] = ['Tournament', 'Friendlies', 'Ranked', 'Unranked'];
const PHASES: SetPhase[] = ['Pools', 'Winners', 'Losers', 'Grand'];
const ROUND_TYPES: SetRoundType[] = ['Round', 'Quarters', 'Semis', 'Finals'];

interface SetCardProps {
  setEntry: SetEntry;
  eventName: string;
  /** Optimistic: called with the updated GameSet after metadata changes */
  onSetUpdated: (updatedSet: GameSet) => void;
  /** Optimistic: called after a game is removed from this set */
  onGameRemoved: (setId: string, videoFilePath: string) => void;
  /** Optimistic: called after this set is deleted */
  onSetDeleted: (setId: string) => void;
}

function SetCard({
  setEntry,
  eventName,
  onSetUpdated,
  onGameRemoved,
  onSetDeleted,
}: SetCardProps) {
  const { set, games, title } = setEntry;
  const [showPlayer, setShowPlayer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const resolvedPlayers = useMemo(
    () => getResolvedPlayers(set, games),
    [set, games],
  );
  const isTournament = set.setType === 'Tournament';

  // Track the latest overrides locally so successive blur saves
  // don't clobber each other with stale prop data.
  const overridesRef = useRef<SetPlayerOverride[]>(set.playerOverrides);
  overridesRef.current = set.playerOverrides;

  async function handleUpdate(updates: Record<string, any>) {
    try {
      const updated = await window.flippiSets.update(
        eventName,
        set.id,
        updates,
      );
      onSetUpdated(updated);
    } catch {
      // ignore
    }
  }

  const handlePlayerOverrideSave = useCallback(
    (side: number, name: string) => {
      const overrides = [...overridesRef.current];
      const existing = overrides.findIndex((o) => o.side === side);
      if (existing >= 0) {
        overrides[existing] = { side, name };
      } else {
        overrides.push({ side, name });
      }
      overridesRef.current = overrides;
      handleUpdate({ playerOverrides: overrides });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventName, set.id],
  );

  async function handleRemoveGame(videoFilePath: string) {
    setBusy(true);
    try {
      await window.flippiSets.removeGame(eventName, set.id, videoFilePath);
      onGameRemoved(set.id, videoFilePath);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSet() {
    setBusy(true);
    try {
      await window.flippiSets.delete(eventName, set.id);
      onSetDeleted(set.id);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="pf-set-card">
      {/* Title */}
      <div className="pf-set-title">{title}</div>

      {/* Editable metadata */}
      <div className="pf-set-meta">
        <select
          value={set.matchType}
          onChange={(e) => handleUpdate({ matchType: e.target.value })}
          disabled={busy}
        >
          <option value="Singles">Singles</option>
          <option value="Doubles">Doubles</option>
        </select>

        <select
          value={set.setType}
          onChange={(e) => handleUpdate({ setType: e.target.value })}
          disabled={busy}
        >
          {SET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {isTournament && (
          <>
            <select
              value={set.phase}
              onChange={(e) => handleUpdate({ phase: e.target.value })}
              disabled={busy}
            >
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={set.roundType}
              onChange={(e) => handleUpdate({ roundType: e.target.value })}
              disabled={busy}
            >
              {ROUND_TYPES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {set.roundType === 'Round' && (
              <input
                type="number"
                min="1"
                defaultValue={set.roundNumber}
                onBlur={(e) => handleUpdate({ roundNumber: e.target.value })}
                disabled={busy}
                style={{ width: 60 }}
              />
            )}
          </>
        )}

        {confirmDelete ? (
          <span
            style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              fontSize: '0.8rem',
            }}
          >
            <span style={{ color: '#f87171' }}>Delete this set?</span>
            <button
              type="button"
              className="pf-button pf-button-danger"
              onClick={handleDeleteSet}
              disabled={busy}
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
            >
              {busy ? 'Deleting...' : 'Yes'}
            </button>
            <button
              type="button"
              className="pf-button"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
            >
              No
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="pf-button pf-button-danger"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            style={{
              marginLeft: 'auto',
              fontSize: '0.8rem',
              padding: '4px 10px',
            }}
          >
            Delete Set
          </button>
        )}
      </div>

      {/* Player overrides */}
      <div className="pf-set-player-overrides">
        {resolvedPlayers.map((rp) => {
          const override = set.playerOverrides.find((o) => o.side === rp.side);
          return (
            <PlayerOverrideInput
              key={`${set.id}-p${rp.side}`}
              setId={set.id}
              side={rp.side}
              initialValue={override?.name ?? ''}
              placeholder={rp.resolvedName}
              port={rp.port}
              onSave={handlePlayerOverrideSave}
            />
          );
        })}
      </div>

      {/* Games list */}
      <div className="pf-set-games">
        {games.length === 0 && (
          <div style={{ color: '#777', fontStyle: 'italic', padding: 8 }}>
            No games in this set
          </div>
        )}
        {games.map((game, idx) => (
          <div key={game.video.filePath} className="pf-set-game-card">
            <div style={{ flexShrink: 0, width: 140 }}>
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div
                className="pf-video-thumbnail"
                onClick={() => setShowPlayer(game.video.filePath)}
              >
                <LazyVideoThumbnail
                  src={localFileUrl(game.video.filePath)}
                  width={140}
                />
                <div
                  className="pf-video-play-icon"
                  style={{ fontSize: '1.2rem' }}
                >
                  &#9654;
                </div>
              </div>
              <div style={{ fontSize: '0.7em', color: '#999', marginTop: 2 }}>
                {game.video.fileName}
              </div>
              <div style={{ fontSize: '0.7em', color: '#777' }}>
                {formatFileSize(game.video.fileSize)}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: '#cbd5e1',
                  marginBottom: 4,
                }}
              >
                Game {idx + 1}
              </div>
              {game.slpGameData && (
                <GameMatchInfo slpGameData={game.slpGameData} />
              )}
              {!game.slpGameData && game.slpFile && (
                <div style={{ fontSize: '0.8em', color: '#999' }}>
                  {game.slpFile.fileName}
                </div>
              )}
              {!game.slpGameData && !game.slpFile && (
                <div
                  style={{
                    fontSize: '0.8em',
                    color: '#777',
                    fontStyle: 'italic',
                  }}
                >
                  No SLP data
                </div>
              )}
              {game.slpFile && (
                <div
                  style={{ fontSize: '0.7em', color: '#555', marginTop: 2 }}
                  title={game.slpFile.filePath}
                >
                  SLP: {game.slpFile.fileName}
                </div>
              )}
            </div>

            <button
              type="button"
              className="pf-set-remove-btn"
              onClick={() => handleRemoveGame(game.video.filePath)}
              disabled={busy}
              title="Remove from set"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Video player modal */}
      {showPlayer && (
        <VideoPlayerModal
          src={localFileUrl(showPlayer)}
          title={
            games.find((g) => g.video.filePath === showPlayer)?.video
              .fileName ?? ''
          }
          onClose={() => setShowPlayer(null)}
        />
      )}
    </div>
  );
}

export default memo(SetCard);
