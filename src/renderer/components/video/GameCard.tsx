import { useState, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import type { GameEntry, SetEntry } from '../../../common/meleeTypes';
import GameMatchInfo from './GameMatchInfo';
import NewSetForm from './NewSetForm';
import LazyVideoThumbnail from './LazyVideoThumbnail';

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

function GameCard({
  game,
  sets,
  eventName,
  onSetChanged,
  currentSetId,
}: GameCardProps) {
  const { video, slpFile } = game;
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
        gap: 16,
        padding: 12,
        marginBottom: 8,
        alignItems: 'flex-start',
      }}
    >
      {/* Video preview — click to play */}
      <div style={{ flexShrink: 0, width: 220 }}>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div className="pf-video-thumbnail" onClick={() => setShowPlayer(true)}>
          <LazyVideoThumbnail src={localFileUrl(video.filePath)} width={220} />
          <div className="pf-video-play-icon">&#9654;</div>
        </div>
        <div
          style={{ fontSize: '0.8em', color: '#999', marginTop: 4 }}
          title={video.filePath}
        >
          {video.fileName}
        </div>
        <div style={{ fontSize: '0.75em', color: '#777' }}>
          {formatFileSize(video.fileSize)}
        </div>
      </div>

      {/* SLP info + set assignment */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {slpFile ? (
          <>
            {game.slpGameData ? (
              <GameMatchInfo slpGameData={game.slpGameData} />
            ) : (
              <>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  SLP Source File
                </div>
                <div
                  style={{ fontSize: '0.9em', wordBreak: 'break-all' }}
                  title={slpFile.filePath}
                >
                  {slpFile.fileName}
                </div>
                <div style={{ fontSize: '0.8em', color: '#999', marginTop: 4 }}>
                  Game started: {formatTimestamp(slpFile.gameStartedAt)}
                </div>
                <div style={{ fontSize: '0.8em', color: '#999' }}>
                  {formatFileSize(slpFile.fileSize)}
                </div>
              </>
            )}
            <div
              style={{ fontSize: '0.75em', color: '#666', marginTop: 4 }}
              title={slpFile.filePath}
            >
              {slpFile.fileName} &middot; {formatFileSize(slpFile.fileSize)}
            </div>
          </>
        ) : (
          <div style={{ color: '#777', fontStyle: 'italic', marginTop: 8 }}>
            No SLP file paired
          </div>
        )}

        {/* Add to Set dropdown */}
        {sets && eventName && (
          <div className="pf-add-to-set">
            {currentSetId && currentSet ? (
              <span
                className="pf-match-badge"
                style={{ fontSize: '0.8rem' }}
                title={currentSet.title}
              >
                In set:{' '}
                {currentSet.title.length > 50
                  ? `${currentSet.title.slice(0, 50)}...`
                  : currentSet.title}
              </span>
            ) : (
              <select
                value=""
                onChange={(e) => handleSetSelect(e.target.value)}
                style={{ fontSize: '0.8rem' }}
              >
                <option value="">Add to Set...</option>
                {sets.map((s) => (
                  <option key={s.set.id} value={s.set.id}>
                    {s.title.length > 60
                      ? `${s.title.slice(0, 60)}...`
                      : s.title}
                  </option>
                ))}
                <option value="__new__">+ New Set...</option>
              </select>
            )}
          </div>
        )}
      </div>

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
