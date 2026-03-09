import { useState, useEffect, useCallback } from 'react';
import type { GameEntry } from '../../../common/meleeTypes';
import GameMatchInfo from './GameMatchInfo';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTimestamp(iso: string): string {
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
function localFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return `local-file://${encodeURIComponent(normalized)}`;
}

interface VideoPlayerModalProps {
  src: string;
  title: string;
  onClose: () => void;
}

function VideoPlayerModal({ src, title, onClose }: VideoPlayerModalProps) {
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

  return (
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
    </div>
  );
}

interface GameCardProps {
  game: GameEntry;
}

function GameCard({ game }: GameCardProps) {
  const { video, slpFile } = game;
  const [showPlayer, setShowPlayer] = useState(false);

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
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={localFileUrl(video.filePath)}
            preload="metadata"
            style={{
              width: 220,
              borderRadius: 4,
              backgroundColor: '#111',
              display: 'block',
            }}
            onLoadedMetadata={(e) => {
              const vid = e.currentTarget;
              if (vid.duration > 2) vid.currentTime = 2;
            }}
          />
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

      {/* SLP info */}
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
      </div>

      {/* Video player modal */}
      {showPlayer && (
        <VideoPlayerModal
          src={localFileUrl(video.filePath)}
          title={video.fileName}
          onClose={() => setShowPlayer(false)}
        />
      )}
    </div>
  );
}

export default GameCard;
