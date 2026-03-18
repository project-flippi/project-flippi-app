import { useState, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import type { GameEntry, SetEntry } from '../../../common/meleeTypes';
import { getStageName } from '../../../common/meleeResources';
import GameMatchInfo, { formatDuration } from './GameMatchInfo';
import NewSetForm from './NewSetForm';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Convert an absolute file path to a local-file:// URL for use in <video src>.
 * Uses a custom Electron protocol to bypass web security restrictions in dev mode.
 */
export function localFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return `local-file://${encodeURIComponent(normalized)}`;
}

interface VideoPlayerModalProps {
  src: string;
  title: string;
  onClose: () => void;
}

export function VideoPlayerModal({
  src,
  title,
  onClose,
}: VideoPlayerModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return createPortal(
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className="pf-video-modal-overlay" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="pf-video-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pf-video-modal-header">
          <span className="pf-video-modal-title">{title}</span>
          <button
            type="button"
            className="pf-video-modal-close"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={src} controls autoPlay className="pf-video-modal-player" />
      </div>
    </div>,
    document.body,
  );
}

interface GameCardProps {
  game: GameEntry;
  /** Available sets for the "Add to Set" dropdown */
  sets?: SetEntry[];
  /** Current event name */
  eventName?: string;
  /** Called after a set mutation (add/create) */
  onSetChanged?: () => void;
  /** The set ID this game currently belongs to, if any */
  currentSetId?: string | null;
}

function renderMatchMetadata(
  slp: GameEntry['slpGameData'],
  slpFile: GameEntry['slpFile'],
  video: GameEntry['video'],
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
      <>
        <span
          style={{ fontSize: '0.8rem', fontWeight: 600 }}
          title={slpFile.filePath}
        >
          {slpFile.fileName}
        </span>
        <span style={{ fontSize: '0.75rem', color: '#999' }}>
          {formatTimestamp(slpFile.gameStartedAt)}
        </span>
      </>
    );
  }
  return (
    <>
      <span
        style={{
          fontSize: '0.8rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={video.filePath}
      >
        {video.fileName}
      </span>
      <span
        style={{
          color: '#777',
          fontStyle: 'italic',
          fontSize: '0.8rem',
        }}
      >
        No SLP file paired
      </span>
    </>
  );
}

function GameCard({
  game,
  sets,
  eventName,
  onSetChanged,
  currentSetId,
}: GameCardProps) {
  const { video, slpFile } = game;
  const slp = game.slpGameData;
  const [showPlayer, setShowPlayer] = useState(false);
  const [showNewSetForm, setShowNewSetForm] = useState(false);

  const currentSet = sets?.find((s) => s.set.id === currentSetId);

  async function handleSetSelect(value: string) {
    if (!eventName) return;
    if (value === '__new__') {
      setShowNewSetForm(true);
      return;
    }
    if (value && value !== '') {
      try {
        await window.flippiSets.addGame(eventName, value, video.filePath);
        onSetChanged?.();
      } catch (err: any) {
        // eslint-disable-next-line no-alert
        alert(err?.message ?? 'Failed to add to set');
      }
    }
  }

  return (
    <div
      className="pf-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 12px',
        marginBottom: 4,
      }}
    >
      {/* Row 1: match info left, actions right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        {/* Left: match metadata */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
            flex: 1,
          }}
        >
          {renderMatchMetadata(slp, slpFile, video)}
        </div>

        {/* Right: play button + set dropdown */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className="pf-play-btn"
            onClick={() => setShowPlayer(true)}
            title="Play video"
          >
            &#9654;
          </button>
          {sets && eventName && currentSetId && currentSet && (
            <span
              className="pf-match-badge"
              style={{ fontSize: '0.75rem' }}
              title={currentSet.title}
            >
              Set:{' '}
              {currentSet.title.length > 40
                ? `${currentSet.title.slice(0, 40)}...`
                : currentSet.title}
            </span>
          )}
          {sets && eventName && !currentSetId && (
            <select
              value=""
              onChange={(e) => handleSetSelect(e.target.value)}
              style={{ fontSize: '0.75rem' }}
              className="pf-add-to-set-select"
            >
              <option value="">Add to Set...</option>
              {sets.map((s) => (
                <option key={s.set.id} value={s.set.id} title={s.title}>
                  {s.title.length > 50 ? `${s.title.slice(0, 50)}...` : s.title}
                </option>
              ))}
              <option value="__new__">+ New Set...</option>
            </select>
          )}
        </div>
      </div>

      {/* Row 2: players (horizontal) */}
      {slp && <GameMatchInfo slpGameData={slp} />}

      {/* Video player modal */}
      {showPlayer && (
        <VideoPlayerModal
          src={localFileUrl(video.filePath)}
          title={video.fileName}
          onClose={() => setShowPlayer(false)}
        />
      )}

      {/* New set form modal */}
      {showNewSetForm && eventName && (
        <NewSetForm
          eventName={eventName}
          videoFilePath={video.filePath}
          slpGameData={game.slpGameData}
          onCreated={() => {
            setShowNewSetForm(false);
            onSetChanged?.();
          }}
          onCancel={() => setShowNewSetForm(false)}
        />
      )}
    </div>
  );
}

GameCard.defaultProps = {
  sets: undefined,
  eventName: undefined,
  onSetChanged: undefined,
  currentSetId: null,
};

export default memo(GameCard);
