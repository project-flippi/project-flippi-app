import { memo, useCallback, useState } from 'react';
import type { ReplayClipEntry } from '../../../common/meleeTypes';
import { getStageName } from '../../../common/meleeResources';
import GameMatchInfo, { formatDuration } from './GameMatchInfo';
import ClipPreviewModal from './ClipPreviewModal';
import { VideoPlayerModal, localFileUrl } from './GameCard';
import InlineConfirm from '../InlineConfirm';
import useAutoReset from '../../hooks/useAutoReset';

interface ReplayClipCardProps {
  entry: ReplayClipEntry;
  eventName: string;
  onUpdated: () => void;
}

function ReplayClipCard({ entry, eventName, onUpdated }: ReplayClipCardProps) {
  const { clip, slpGameData } = entry;

  const [title, setTitle] = useState(clip.title);
  const [description, setDescription] = useState(clip.description);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const setStatusAuto = useAutoReset(setStatus, '', 3000);
  const [showPlayer, setShowPlayer] = useState(false);

  const duration = clip.endSeconds - clip.startSeconds;
  const slpFileName = clip.slpPath.split(/[\\/]/).pop() ?? clip.slpPath;
  const clipFileName = clip.outputPath
    ? clip.outputPath.split(/[\\/]/).pop()
    : null;
  const stageName = slpGameData
    ? getStageName(slpGameData.stageId ?? null)
    : '';

  const handleSave = useCallback(async () => {
    setBusy(true);
    try {
      await window.flippiReplayClips.update(eventName, clip.id, {
        title,
        description,
      });
      setStatusAuto('Saved');
      onUpdated();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }, [eventName, clip.id, title, description, onUpdated, setStatusAuto]);

  const handleDelete = useCallback(async () => {
    setBusy(true);
    try {
      await window.flippiReplayClips.delete(eventName, clip.id);
      onUpdated();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }, [eventName, clip.id, onUpdated, setStatusAuto]);

  const cardClass = [
    'pf-replay-clip-card',
    clip.outputPath ? 'pf-replay-clip-card--created' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClass}>
      {/* Row 1: metadata + play button */}
      <div className="pf-replay-clip-row1">
        <div className="pf-replay-clip-meta">
          {slpGameData && (
            <GameMatchInfo slpGameData={slpGameData} hideWinner />
          )}
          <div className="pf-replay-clip-details">
            {slpGameData && <span>{slpGameData.matchType}</span>}
            {stageName && <span>{stageName}</span>}
            <span>{formatDuration(Math.round(duration))}</span>
            <span
              className={`pf-clip-badge ${clip.outputPath ? 'pf-clip-badge--created' : 'pf-clip-badge--preview'}`}
            >
              {clip.outputPath ? 'Created' : 'Preview'}
            </span>
          </div>
          <div className="pf-replay-clip-files">
            <span className="pf-text-muted" title={clip.slpPath}>
              SLP: {slpFileName}
            </span>
            <span className="pf-text-muted">JSON: {clip.importFile}</span>
            {clipFileName && (
              <span className="pf-text-muted">Clip: {clipFileName}</span>
            )}
          </div>
        </div>
        {clip.videoPath && (
          <button
            type="button"
            className="pf-play-btn"
            onClick={() => setShowPlayer(true)}
            disabled={busy}
            title={clip.outputPath ? 'Play clip' : 'Preview clip'}
            aria-label={clip.outputPath ? 'Play clip' : 'Preview clip'}
          >
            &#9654;
          </button>
        )}
      </div>

      {/* Row 2: editable fields + actions */}
      <div className="pf-replay-clip-row2">
        <input
          id={`rc-title-${clip.id}`}
          className="pf-replay-clip-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          placeholder="Title"
          aria-label="Clip title"
        />
        <input
          id={`rc-desc-${clip.id}`}
          className="pf-replay-clip-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          placeholder="Description"
          aria-label="Clip description"
        />
        <button
          type="button"
          className="pf-button pf-button-primary pf-button-sm"
          onClick={handleSave}
          disabled={busy}
        >
          Save
        </button>
        <InlineConfirm
          triggerLabel="Delete"
          prompt="Delete clip?"
          onConfirm={handleDelete}
          busy={busy}
          sizeClass="pf-button-sm"
        />
        {status && <span className="pf-status-message">{status}</span>}
      </div>

      {/* Video player modal */}
      {showPlayer && clip.videoPath && clip.outputPath && (
        <VideoPlayerModal
          src={localFileUrl(clip.outputPath)}
          title={clipFileName || slpFileName}
          onClose={() => setShowPlayer(false)}
        />
      )}
      {showPlayer && clip.videoPath && !clip.outputPath && (
        <ClipPreviewModal
          src={localFileUrl(clip.videoPath)}
          title={title || slpFileName}
          startSeconds={clip.startSeconds}
          endSeconds={clip.endSeconds}
          onClose={() => setShowPlayer(false)}
        />
      )}
    </div>
  );
}

export default memo(ReplayClipCard);
