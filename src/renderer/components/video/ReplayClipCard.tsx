import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReplayClipEntry } from '../../../common/meleeTypes';
import { getStageName } from '../../../common/meleeResources';
import GameMatchInfo, { formatDuration } from './GameMatchInfo';
import ClipPreviewModal from './ClipPreviewModal';
import { VideoPlayerModal, localFileUrl } from './GameCard';
import InlineConfirm from '../InlineConfirm';
import useAutoReset from '../../hooks/useAutoReset';
import useFocusTrap from '../../hooks/useFocusTrap';

// ---------------------------------------------------------------------------
// Expand modal for title + description
// ---------------------------------------------------------------------------

interface ClipFieldsExpandModalProps {
  title: string;
  description: string;
  onClose: (newTitle: string, newDescription: string) => void;
}

function ClipFieldsExpandModal({
  title,
  description,
  onClose,
}: ClipFieldsExpandModalProps) {
  const [editTitle, setEditTitle] = useState(title);
  const [editDescription, setEditDescription] = useState(description);
  const focusTrapRef = useFocusTrap<HTMLDivElement>();
  const titleRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    onClose(editTitle, editDescription);
  }, [editTitle, editDescription, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleClose]);

  // Focus title input on mount
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="pf-video-modal-overlay"
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Edit clip details"
      ref={focusTrapRef}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="pf-video-modal-content pf-clip-expand-modal pf-clip-expand-modal--wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pf-video-modal-header">
          <span className="pf-video-modal-title">Edit Clip Details</span>
          <button
            type="button"
            className="pf-video-modal-close"
            onClick={handleClose}
            aria-label="Close editor"
          >
            &times;
          </button>
        </div>
        <div className="pf-clip-expand-fields">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label className="pf-clip-expand-label">
            Title
            <input
              ref={titleRef}
              className="pf-clip-expand-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </label>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label className="pf-clip-expand-label">
            Description
            <textarea
              className="pf-clip-expand-textarea"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={8}
            />
          </label>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// ReplayClipCard
// ---------------------------------------------------------------------------

interface ReplayClipCardProps {
  entry: ReplayClipEntry;
  eventName: string;
  selected: boolean;
  onToggleSelect: (clipId: string) => void;
  onUpdated: () => void;
}

function ReplayClipCard({
  entry,
  eventName,
  selected,
  onToggleSelect,
  onUpdated,
}: ReplayClipCardProps) {
  const { clip, slpGameData } = entry;

  const [title, setTitle] = useState(clip.title);
  const [description, setDescription] = useState(clip.description);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const setStatusAuto = useAutoReset(setStatus, '', 3000);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showExpand, setShowExpand] = useState(false);

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

  const handleExpandClose = useCallback(
    (newTitle: string, newDescription: string) => {
      setTitle(newTitle);
      setDescription(newDescription);
      setShowExpand(false);
    },
    [],
  );

  const cardClass = [
    'pf-replay-clip-card',
    clip.outputPath ? 'pf-replay-clip-card--created' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClass}>
      {/* Row 1: checkbox + metadata + play button */}
      <div className="pf-replay-clip-row1">
        <input
          type="checkbox"
          className="pf-replay-clip-checkbox"
          checked={selected}
          onChange={() => onToggleSelect(clip.id)}
          aria-label="Select clip"
        />
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
          onBlur={handleSave}
          disabled={busy}
          placeholder="Title"
          aria-label="Clip title"
        />
        <input
          id={`rc-desc-${clip.id}`}
          className="pf-replay-clip-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleSave}
          disabled={busy}
          placeholder="Description"
          aria-label="Clip description"
        />
        <button
          type="button"
          className="pf-clip-expand-btn"
          onClick={() => setShowExpand(true)}
          disabled={busy}
          title="Expand fields"
          aria-label="Expand title and description"
        >
          &#x2922;
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

      {/* Expand modal for title + description */}
      {showExpand && (
        <ClipFieldsExpandModal
          title={title}
          description={description}
          onClose={handleExpandClose}
        />
      )}

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
          clipId={clip.id}
          eventName={eventName}
          onClose={() => setShowPlayer(false)}
          onTimesUpdated={() => onUpdated()}
        />
      )}
    </div>
  );
}

export default memo(ReplayClipCard);
