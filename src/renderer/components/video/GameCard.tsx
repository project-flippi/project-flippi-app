import type { GameEntry } from '../../../common/meleeTypes';

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

interface GameCardProps {
  game: GameEntry;
}

function GameCard({ game }: GameCardProps) {
  const { video, slpFile } = game;

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
      {/* Video preview */}
      <div style={{ flexShrink: 0, width: 220 }}>
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
            // Seek to 2 seconds for a better preview frame
            const vid = e.currentTarget;
            if (vid.duration > 2) vid.currentTime = 2;
          }}
        />
        <div
          style={{ fontSize: '0.8em', color: '#999', marginTop: 4 }}
          title={video.filePath}
        >
          {video.fileName}
        </div>
        <div style={{ fontSize: '0.75em', color: '#777' }}>
          {formatFileSize(video.fileSize)} &middot;{' '}
          {formatTimestamp(video.fileCreatedAt)}
        </div>
      </div>

      {/* SLP info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {slpFile ? (
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
        ) : (
          <div style={{ color: '#777', fontStyle: 'italic', marginTop: 8 }}>
            No SLP file paired
          </div>
        )}
      </div>
    </div>
  );
}

export default GameCard;
