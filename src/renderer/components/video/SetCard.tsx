import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import useFocusTrap from '../../hooks/useFocusTrap';
import useAutoReset from '../../hooks/useAutoReset';
import InlineConfirm from '../InlineConfirm';
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

/** Fullscreen image lightbox with focus trap and Escape support. */
function ThumbnailLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Thumbnail preview"
      ref={focusTrapRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        cursor: 'pointer',
      }}
    >
      <img
        src={src}
        alt="Thumbnail full size"
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          borderRadius: 6,
          boxShadow: '0 4px 32px rgba(0,0,0,0.6)',
        }}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid #555',
          color: '#e5e7eb',
          fontSize: '1.4rem',
          width: 36,
          height: 36,
          borderRadius: 8,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        &times;
      </button>
    </div>,
    document.body,
  );
}

/** Animated "Compiling..." indicator with cycling dots. */
function CompilingIndicator() {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ color: 'var(--pf-text-muted)', fontSize: '0.8rem' }}>
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
        <span style={{ fontSize: '0.8rem', color: 'var(--pf-text-muted)' }}>
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
              color: 'var(--pf-text-faint)',
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
        style={{ fontSize: '0.8rem', color: 'var(--pf-text-muted)' }}
        title={slpFile.filePath}
      >
        {slpFile.fileName}
      </span>
    );
  }
  return (
    <span
      style={{
        color: 'var(--pf-text-muted)',
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

  const handleDeleteSet = useCallback(async () => {
    setBusy(true);
    try {
      await window.flippiSets.delete(eventName, set.id);
      onSetDeleted(set.id);
    } finally {
      setBusy(false);
    }
  }, [eventName, set.id, onSetDeleted]);

  const handleDeleteVideo = useCallback(async () => {
    setBusy(true);
    try {
      const updated = await window.flippiSets.deleteVideo(eventName, set.id);
      setCompiledVideoPath(null);
      onSetUpdated(updated);
    } finally {
      setBusy(false);
    }
  }, [eventName, set.id, onSetUpdated]);

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
  const setRenameStatusAuto = useAutoReset(setRenameStatus, null, 5000);

  // Thumbnail state
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(
    set.thumbnailPath ?? null,
  );
  const [thumbnailBusy, setThumbnailBusy] = useState(false);
  const [thumbnailVersion, setThumbnailVersion] = useState(0);
  const [showThumbnailFull, setShowThumbnailFull] = useState(false);

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
      setThumbnailVersion((v) => v + 1);
      onSetUpdated(updated);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SetCard] Thumbnail generation failed:', err);
    } finally {
      setThumbnailBusy(false);
    }
  }

  const handleDeleteThumbnail = useCallback(async () => {
    setThumbnailBusy(true);
    try {
      const updated = await window.flippiThumbnail.delete(eventName, set.id);
      setThumbnailPath(null);
      onSetUpdated(updated);
    } finally {
      setThumbnailBusy(false);
    }
  }, [eventName, set.id, onSetUpdated]);

  async function handleRenameVideo() {
    setBusy(true);
    setRenameStatus(null);
    try {
      const updated = await window.flippiSets.renameVideo(eventName, set.id);
      setCompiledVideoPath(updated.compiledVideoPath ?? null);
      onSetUpdated(updated);
    } catch (err: any) {
      setRenameStatusAuto(err?.message ?? 'Rename failed');
    } finally {
      setBusy(false);
    }
  }

  // Stable refs for the compile progress callback to avoid re-subscribing
  const setRef = useRef(set);
  setRef.current = set;
  const onSetUpdatedRef = useRef(onSetUpdated);
  onSetUpdatedRef.current = onSetUpdated;

  // Timer ref for compile status auto-clear
  const compileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    };
  }, []);

  function clearCompileAfter(ms: number) {
    if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    compileTimerRef.current = setTimeout(() => {
      setCompileProgress(null);
      setCompileStatus(null);
    }, ms);
  }

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
        clearCompileAfter(2000);
      } else if (progress.status === 'error') {
        setCompileStatus(progress.error ?? 'Failed');
        clearCompileAfter(5000);
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
      clearCompileAfter(5000);
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
          aria-label="Match type"
        >
          <option value="Singles">Singles</option>
          <option value="Doubles">Doubles</option>
        </select>

        <select
          value={set.setType}
          onChange={(e) => handleUpdate({ setType: e.target.value })}
          disabled={busy}
          aria-label="Set type"
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
              aria-label="Tournament phase"
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
              aria-label="Round type"
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
                aria-label="Round number"
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
                    color:
                      compileStatus === 'Done!'
                        ? 'var(--pf-success-light)'
                        : 'var(--pf-danger-light)',
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
                className="pf-play-btn pf-button-md"
                onClick={() => setShowPlayer(compiledVideoPath)}
                title="Play compiled set video"
              >
                &#9654; Set Video
              </button>
              <InlineConfirm
                triggerLabel="Delete Video"
                prompt="Delete video?"
                onConfirm={handleDeleteVideo}
                busy={busy}
                disabled={busy}
              />
              {needsRename && (
                <button
                  type="button"
                  className="pf-button pf-button-sm"
                  onClick={handleRenameVideo}
                  disabled={busy}
                  title="Rename the video file to match the updated set title"
                >
                  Rename Video
                </button>
              )}
              {renameStatus && (
                <span
                  style={{
                    color: 'var(--pf-danger-light)',
                    fontSize: '0.75rem',
                  }}
                >
                  {renameStatus}
                </span>
              )}
            </>
          )}
          {compileProgress == null && !compiledVideoPath && (
            <button
              type="button"
              className="pf-button pf-button-md"
              onClick={handleCompile}
              disabled={busy || games.length === 0}
            >
              Compile
            </button>
          )}
        </span>

        <InlineConfirm
          triggerLabel="Delete Set"
          prompt={
            compiledVideoPath
              ? 'Delete this set and its video file (.mp4)?'
              : 'Delete this set?'
          }
          onConfirm={handleDeleteSet}
          busy={busy}
          disabled={busy}
          sizeClass="pf-button-md"
          style={{ marginLeft: 'auto' }}
        />
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
          borderTop: '1px solid var(--pf-border-control)',
        }}
      >
        {thumbnailPath && (
          <>
            <button
              type="button"
              onClick={() => setShowThumbnailFull(true)}
              aria-label="View thumbnail full size"
              style={{
                padding: 0,
                border: '1px solid var(--pf-border-control)',
                borderRadius: 4,
                cursor: 'pointer',
                background: 'none',
                lineHeight: 0,
              }}
            >
              <img
                src={`${localImageUrl(thumbnailPath)}&t=${thumbnailVersion}`}
                alt="Set thumbnail"
                style={{
                  width: 160,
                  height: 90,
                  objectFit: 'cover',
                  borderRadius: 3,
                  display: 'block',
                }}
              />
            </button>
            {showThumbnailFull && (
              <ThumbnailLightbox
                src={`${localImageUrl(thumbnailPath)}&t=${thumbnailVersion}`}
                onClose={() => setShowThumbnailFull(false)}
              />
            )}
          </>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="pf-button pf-button-md"
            onClick={handleGenerateThumbnail}
            disabled={thumbnailBusy}
          >
            {/* eslint-disable-next-line no-nested-ternary */}
            {thumbnailBusy
              ? 'Generating\u2026'
              : thumbnailPath
                ? 'Regenerate Thumbnail'
                : 'Generate Thumbnail'}
          </button>
          {thumbnailPath && (
            <InlineConfirm
              triggerLabel="Delete Thumbnail"
              prompt="Delete?"
              onConfirm={handleDeleteThumbnail}
              busy={thumbnailBusy}
              disabled={thumbnailBusy}
            />
          )}
        </div>
      </div>

      {/* Games list */}
      <div className="pf-set-games">
        {games.length === 0 && (
          <div
            style={{
              color: 'var(--pf-text-muted)',
              fontStyle: 'italic',
              padding: 8,
            }}
          >
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
                      color: 'var(--pf-text-secondary)',
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
                    aria-label={`Play game ${idx + 1} video`}
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
                      aria-label={`Remove game ${idx + 1} from set`}
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
