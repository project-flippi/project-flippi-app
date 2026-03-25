import { memo, useCallback, useState } from 'react';
import type { ReplayClipEntry } from '../../../common/meleeTypes';
import { getStageName } from '../../../common/meleeResources';
import GameMatchInfo, { formatDuration } from './GameMatchInfo';
import ClipPreviewModal from './ClipPreviewModal';
import InlineConfirm from '../InlineConfirm';
import useAutoReset from '../../hooks/useAutoReset';
import { localFileUrl } from './GameCard';

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
  const [showPreview, setShowPreview] = useState(false);

  const duration = clip.endSeconds - clip.startSeconds;
  const slpFileName = clip.slpPath.split(/[\\/]/).pop() ?? clip.slpPath;
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

  const handleRemove = useCallback(async () => {
    setBusy(true);
    try {
      await window.flippiReplayClips.remove(eventName, clip.id);
      onUpdated();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }, [eventName, clip.id, onUpdated, setStatusAuto]);

  const handleRestore = useCallback(async () => {
    setBusy(true);
    try {
      await window.flippiReplayClips.restore(eventName, clip.id);
      onUpdated();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }, [eventName, clip.id, onUpdated, setStatusAuto]);

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
    clip.removed ? 'pf-replay-clip-card--removed' : '',
    clip.outputPath ? 'pf-replay-clip-card--created' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClass}>
      {/* Left section: metadata */}
      <div className="pf-replay-clip-meta">
        {slpGameData && <GameMatchInfo slpGameData={slpGameData} />}
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
        </div>
      </div>

      {/* Middle section: editable fields */}
      <div className="pf-replay-clip-fields">
        <div className="pf-field">
          <label htmlFor={`rc-title-${clip.id}`}>
            Title
            <input
              id={`rc-title-${clip.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="Clip title"
            />
          </label>
        </div>
        <div className="pf-field">
          <label htmlFor={`rc-desc-${clip.id}`}>
            Description
            <textarea
              id={`rc-desc-${clip.id}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              placeholder="Clip description"
              rows={2}
            />
          </label>
        </div>
      </div>

      {/* Right section: actions */}
      <div className="pf-replay-clip-actions">
        {clip.videoPath && (
          <button
            type="button"
            className="pf-button pf-button-sm"
            onClick={() => setShowPreview(true)}
            disabled={busy}
          >
            Preview
          </button>
        )}
        <button
          type="button"
          className="pf-button pf-button-primary pf-button-sm"
          onClick={handleSave}
          disabled={busy}
        >
          Save
        </button>
        {clip.removed ? (
          <button
            type="button"
            className="pf-button pf-button-sm"
            onClick={handleRestore}
            disabled={busy}
          >
            Restore
          </button>
        ) : (
          <InlineConfirm
            triggerLabel="Remove"
            prompt="Remove clip?"
            onConfirm={handleRemove}
            busy={busy}
            sizeClass="pf-button-sm"
          />
        )}
        <InlineConfirm
          triggerLabel="Delete"
          prompt="Permanently delete?"
          onConfirm={handleDelete}
          busy={busy}
          sizeClass="pf-button-sm"
        />
        {status && <span className="pf-status-message">{status}</span>}
      </div>

      {/* Preview modal */}
      {showPreview && clip.videoPath && (
        <ClipPreviewModal
          src={localFileUrl(clip.videoPath)}
          title={title || slpFileName}
          startSeconds={clip.startSeconds}
          endSeconds={clip.endSeconds}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

export default memo(ReplayClipCard);
