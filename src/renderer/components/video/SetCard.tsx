import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import type {
  GameEntry,
  SetEntry,
  SetPhase,
  SetType,
  SetRoundType,
  GameSet,
  SetPlayerOverride,
} from '../../../common/meleeTypes';
import { getResolvedPlayers, sanitizeFilename } from '../../../common/setUtils';
import GameMatchInfo, { formatDuration } from './GameMatchInfo';
import {
  VideoPlayerModal,
  localFileUrl,
  localImageUrl,
  getVideoServerInfo,
} from './GameCard';
import { getStageName } from '../../../common/meleeResources';
import { renderThumbnail } from '../../utils/thumbnailRenderer';

/** Animated "Compiling..." indicator with cycling dots. */
function CompilingIndicator() {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
      Compiling{'.'.repeat(dots)}
    </span>
  );
}

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

function renderSetGameMetadata(
  slp: GameEntry['slpGameData'],
  slpFile: GameEntry['slpFile'],
) {
  if (slp) {
    return (
      <>
        <span className="pf-match-badge">{slp.matchType}</span>
        {slp.stageId != null && (
          <span className="pf-match-badge">{getStageName(slp.stageId)}</span>
        )}
        {slp.durationSeconds != null && (
          <span className="pf-match-duration">
            {formatDuration(slp.durationSeconds)}
          </span>
        )}
        {!slp.gameComplete && (
          <span className="pf-match-incomplete">Incomplete</span>
        )}
        {slpFile && (
          <span
            style={{
              fontSize: '0.75rem',
              color: '#666',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={slpFile.filePath}
          >
            {slpFile.fileName}
          </span>
        )}
      </>
    );
  }
  if (slpFile) {
    return (
      <span
        style={{ fontSize: '0.8rem', color: '#999' }}
        title={slpFile.filePath}
      >
        {slpFile.fileName}
      </span>
    );
  }
  return (
    <span
      style={{
        color: '#777',
        fontStyle: 'italic',
        fontSize: '0.8rem',
      }}
    >
      No SLP data
    </span>
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
  const [confirmDeleteVideo, setConfirmDeleteVideo] = useState(false);
  const [compileProgress, setCompileProgress] = useState<number | null>(null);
  const [compileStatus, setCompileStatus] = useState<string | null>(null);
  const [compiledVideoPath, setCompiledVideoPath] = useState<string | null>(
    set.compiledVideoPath ?? null,
  );

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

  async function handleDeleteVideo() {
    setBusy(true);
    try {
      const updated = await window.flippiSets.deleteVideo(eventName, set.id);
      setCompiledVideoPath(null);
      onSetUpdated(updated);
    } finally {
      setBusy(false);
      setConfirmDeleteVideo(false);
    }
  }

  // Detect if the compiled video filename differs from current title
  const needsRename = useMemo(() => {
    if (!compiledVideoPath) return false;
    const expectedFilename = `${sanitizeFilename(title)}.mp4`;
    // Extract basename from path (works with both / and \)
    const parts = compiledVideoPath.replace(/\\/g, '/').split('/');
    const currentFilename = parts[parts.length - 1];
    return currentFilename !== expectedFilename;
  }, [compiledVideoPath, title]);

  const [renameStatus, setRenameStatus] = useState<string | null>(null);

  // Thumbnail state
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(
    set.thumbnailPath ?? null,
  );
  const [thumbnailBusy, setThumbnailBusy] = useState(false);
  const [confirmDeleteThumbnail, setConfirmDeleteThumbnail] = useState(false);

  async function handleGenerateThumbnail() {
    setThumbnailBusy(true);
    try {
      const settings = await window.flippiThumbnail.getSettings(eventName);
      const { port, token } = getVideoServerInfo();
      const dataUrl = await renderThumbnail({
        eventName,
        set,
        games,
        settings,
        serverPort: port,
        serverToken: token,
      });
      const updated = await window.flippiThumbnail.save(
        eventName,
        set.id,
        dataUrl,
      );
      setThumbnailPath(updated.thumbnailPath ?? null);
      onSetUpdated(updated);
    } catch (err) {
      console.error('[SetCard] Thumbnail generation failed:', err);
    } finally {
      setThumbnailBusy(false);
    }
  }

  async function handleDeleteThumbnail() {
    setThumbnailBusy(true);
    try {
      const updated = await window.flippiThumbnail.delete(eventName, set.id);
      setThumbnailPath(null);
      onSetUpdated(updated);
    } finally {
      setThumbnailBusy(false);
      setConfirmDeleteThumbnail(false);
    }
  }

  async function handleRenameVideo() {
    setBusy(true);
    setRenameStatus(null);
    try {
      const updated = await window.flippiSets.renameVideo(eventName, set.id);
      setCompiledVideoPath(updated.compiledVideoPath ?? null);
      onSetUpdated(updated);
    } catch (err: any) {
      setRenameStatus(err?.message ?? 'Rename failed');
      setTimeout(() => setRenameStatus(null), 5000);
    } finally {
      setBusy(false);
    }
  }

  // Stable refs for the compile progress callback to avoid re-subscribing
  const setRef = useRef(set);
  setRef.current = set;
  const onSetUpdatedRef = useRef(onSetUpdated);
  onSetUpdatedRef.current = onSetUpdated;

  // Listen for compile progress events for this set
  useEffect(() => {
    const cleanup = window.flippiSets.onCompileProgress((_event, progress) => {
      if (progress.setId !== set.id) return;
      setCompileProgress(progress.percent);
      if (progress.status === 'done') {
        if (progress.filePath) {
          setCompiledVideoPath(progress.filePath);
          onSetUpdatedRef.current({
            ...setRef.current,
            compiledVideoPath: progress.filePath,
          });
        }
        setCompileStatus('Done!');
        setTimeout(() => {
          setCompileProgress(null);
          setCompileStatus(null);
        }, 2000);
      } else if (progress.status === 'error') {
        setCompileStatus(progress.error ?? 'Failed');
        setTimeout(() => {
          setCompileProgress(null);
          setCompileStatus(null);
        }, 5000);
      }
    });
    return cleanup;
  }, [set.id]);

  async function handleCompile() {
    if (games.length === 0) return;
    setCompileProgress(0);
    setCompileStatus(null);
    try {
      await window.flippiSets.compile(eventName, set.id);
    } catch (err: any) {
      setCompileStatus(err?.message ?? 'Compilation failed');
      setTimeout(() => {
        setCompileProgress(null);
        setCompileStatus(null);
      }, 5000);
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

        {/* Compile + Delete — pushed to the right */}
        <span
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}
        >
          {compileProgress != null && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.8rem',
              }}
            >
              {compileStatus ? (
                <span
                  style={{
                    color: compileStatus === 'Done!' ? '#4ade80' : '#f87171',
                  }}
                >
                  {compileStatus}
                </span>
              ) : (
                <CompilingIndicator />
              )}
            </span>
          )}
          {compileProgress == null && compiledVideoPath && (
            <>
              <button
                type="button"
                className="pf-play-btn"
                onClick={() => setShowPlayer(compiledVideoPath)}
                title="Play compiled set video"
                style={{ fontSize: '0.8rem', padding: '4px 10px' }}
              >
                &#9654; Set Video
              </button>
              {confirmDeleteVideo ? (
                <span
                  style={{
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                    fontSize: '0.8rem',
                  }}
                >
                  <span style={{ color: '#f87171' }}>Delete video?</span>
                  <button
                    type="button"
                    className="pf-button pf-button-danger"
                    onClick={handleDeleteVideo}
                    disabled={busy}
                    style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                  >
                    {busy ? 'Deleting...' : 'Yes'}
                  </button>
                  <button
                    type="button"
                    className="pf-button"
                    onClick={() => setConfirmDeleteVideo(false)}
                    disabled={busy}
                    style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="pf-button pf-button-danger"
                  onClick={() => setConfirmDeleteVideo(true)}
                  disabled={busy}
                  style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                  title="Delete the compiled video to unlock game editing"
                >
                  Delete Video
                </button>
              )}
              {needsRename && (
                <button
                  type="button"
                  className="pf-button"
                  onClick={handleRenameVideo}
                  disabled={busy}
                  style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                  title="Rename the video file to match the updated set title"
                >
                  Rename Video
                </button>
              )}
              {renameStatus && (
                <span style={{ color: '#f87171', fontSize: '0.75rem' }}>
                  {renameStatus}
                </span>
              )}
            </>
          )}
          {compileProgress == null && !compiledVideoPath && (
            <button
              type="button"
              className="pf-button"
              onClick={handleCompile}
              disabled={busy || games.length === 0}
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
            >
              Compile
            </button>
          )}
        </span>

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
            <span style={{ color: '#f87171' }}>
              {compiledVideoPath
                ? 'Delete this set and its video file (.mp4)?'
                : 'Delete this set?'}
            </span>
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

      {/* Thumbnail section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 0',
          borderTop: '1px solid #333',
        }}
      >
        {thumbnailPath && (
          <img
            src={localImageUrl(thumbnailPath)}
            alt="Thumbnail"
            style={{
              width: 160,
              height: 90,
              objectFit: 'cover',
              borderRadius: 4,
              border: '1px solid #444',
            }}
          />
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="pf-button"
            onClick={handleGenerateThumbnail}
            disabled={thumbnailBusy}
            style={{ fontSize: '0.8rem', padding: '4px 10px' }}
          >
            {/* eslint-disable-next-line no-nested-ternary */}
            {thumbnailBusy
              ? 'Generating...'
              : thumbnailPath
                ? 'Regenerate Thumbnail'
                : 'Generate Thumbnail'}
          </button>
          {thumbnailPath && !confirmDeleteThumbnail && (
            <button
              type="button"
              className="pf-button pf-button-danger"
              onClick={() => setConfirmDeleteThumbnail(true)}
              disabled={thumbnailBusy}
              style={{ fontSize: '0.75rem', padding: '2px 8px' }}
            >
              Delete Thumbnail
            </button>
          )}
          {confirmDeleteThumbnail && (
            <span
              style={{
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                fontSize: '0.8rem',
              }}
            >
              <span style={{ color: '#f87171' }}>Delete?</span>
              <button
                type="button"
                className="pf-button pf-button-danger"
                onClick={handleDeleteThumbnail}
                disabled={thumbnailBusy}
                style={{ fontSize: '0.75rem', padding: '2px 8px' }}
              >
                Yes
              </button>
              <button
                type="button"
                className="pf-button"
                onClick={() => setConfirmDeleteThumbnail(false)}
                disabled={thumbnailBusy}
                style={{ fontSize: '0.75rem', padding: '2px 8px' }}
              >
                No
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Games list */}
      <div className="pf-set-games">
        {games.length === 0 && (
          <div style={{ color: '#777', fontStyle: 'italic', padding: 8 }}>
            No games in this set
          </div>
        )}
        {games.map((game, idx) => {
          const slp = game.slpGameData;
          return (
            <div
              key={game.video.filePath}
              className="pf-set-game-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '6px 10px',
              }}
            >
              {/* Row 1: game label + metadata left, actions right */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: '#cbd5e1',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    Game {idx + 1}
                  </span>
                  {renderSetGameMetadata(slp, game.slpFile)}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    className="pf-play-btn"
                    onClick={() => setShowPlayer(game.video.filePath)}
                    title="Play video"
                  >
                    &#9654;
                  </button>
                  {!compiledVideoPath && (
                    <button
                      type="button"
                      className="pf-set-remove-btn"
                      onClick={() => handleRemoveGame(game.video.filePath)}
                      disabled={busy}
                      title="Remove from set"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: players (horizontal) */}
              {slp && <GameMatchInfo slpGameData={slp} />}
            </div>
          );
        })}
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
