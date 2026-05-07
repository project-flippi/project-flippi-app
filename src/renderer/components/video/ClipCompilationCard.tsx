import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import type {
  ClipCompilation,
  ClipCompilationEntry,
} from '../../../common/meleeTypes';
import { getStageName } from '../../../common/meleeResources';
import GameMatchInfo, { formatDuration } from './GameMatchInfo';
import { VideoPlayerModal, localFileUrl } from './GameCard';
import InlineConfirm from '../InlineConfirm';
import useAutoReset from '../../hooks/useAutoReset';
import useFocusTrap from '../../hooks/useFocusTrap';

// ---------------------------------------------------------------------------
// Expand modal for compilation title + description
// ---------------------------------------------------------------------------

interface CompilationFieldsExpandModalProps {
  title: string;
  description: string;
  onClose: (newTitle: string, newDescription: string) => void;
}

function CompilationFieldsExpandModal({
  title,
  description,
  onClose,
}: CompilationFieldsExpandModalProps) {
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
      aria-label="Edit compilation details"
      ref={focusTrapRef}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="pf-video-modal-content pf-clip-expand-modal pf-clip-expand-modal--wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pf-video-modal-header">
          <span className="pf-video-modal-title">Edit Compilation Details</span>
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
              rows={10}
            />
          </label>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Compiling indicator (dots animation)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ClipCompilationCard
// ---------------------------------------------------------------------------

interface ClipCompilationCardProps {
  entry: ClipCompilationEntry;
  eventName: string;
  onUpdated: (updated: ClipCompilation) => void;
  onClipRemoved: (compilationId: string, clipId: string) => void;
  onDeleted: (compilationId: string) => void;
  selected?: boolean;
  onToggleSelect?: (compilationId: string) => void;
}

function ClipCompilationCard({
  entry,
  eventName,
  onUpdated,
  onClipRemoved,
  onDeleted,
  selected = false,
  onToggleSelect = undefined,
}: ClipCompilationCardProps) {
  const { compilation, clips } = entry;
  const [title, setTitle] = useState(compilation.title);
  const [description, setDescription] = useState(compilation.description);
  const [showPlayer, setShowPlayer] = useState<string | null>(null);
  const [showExpand, setShowExpand] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const setStatusAuto = useAutoReset(setStatus, '', 3000);
  const [compileProgress, setCompileProgress] = useState<number | null>(null);
  const [compileStatus, setCompileStatus] = useState<string | null>(null);
  const [compiledVideoPath, setCompiledVideoPath] = useState<string | null>(
    compilation.compiledVideoPath ?? null,
  );

  // Keep refs for progress callback
  const compilationRef = useRef(compilation);
  compilationRef.current = compilation;
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  // Sync local state with prop changes
  useEffect(() => {
    setTitle(compilation.title);
  }, [compilation.title]);
  useEffect(() => {
    setDescription(compilation.description);
  }, [compilation.description]);
  useEffect(() => {
    setCompiledVideoPath(compilation.compiledVideoPath ?? null);
  }, [compilation.compiledVideoPath]);

  const handleSave = useCallback(async () => {
    try {
      const updated = await window.flippiClipCompilations.update(
        eventName,
        compilation.id,
        { title, description },
      );
      onUpdated(updated);
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Failed');
    }
  }, [eventName, compilation.id, title, description, onUpdated, setStatusAuto]);

  const handleExpandClose = useCallback(
    async (newTitle: string, newDescription: string) => {
      setTitle(newTitle);
      setDescription(newDescription);
      setShowExpand(false);
      if (newTitle === title && newDescription === description) return;
      try {
        const updated = await window.flippiClipCompilations.update(
          eventName,
          compilation.id,
          { title: newTitle, description: newDescription },
        );
        onUpdated(updated);
      } catch (err: any) {
        setStatusAuto(err?.message ?? 'Failed');
      }
    },
    [eventName, compilation.id, title, description, onUpdated, setStatusAuto],
  );

  const handleRemoveClip = useCallback(
    async (clipId: string) => {
      setBusy(true);
      try {
        await window.flippiClipCompilations.removeClip(
          eventName,
          compilation.id,
          clipId,
        );
        onClipRemoved(compilation.id, clipId);
      } catch (err: any) {
        setStatusAuto(err?.message ?? 'Failed');
      } finally {
        setBusy(false);
      }
    },
    [eventName, compilation.id, onClipRemoved, setStatusAuto],
  );

  const handleDeleteCompilation = useCallback(async () => {
    setBusy(true);
    try {
      await window.flippiClipCompilations.delete(eventName, compilation.id);
      onDeleted(compilation.id);
    } finally {
      setBusy(false);
    }
  }, [eventName, compilation.id, onDeleted]);

  const handleDeleteVideo = useCallback(async () => {
    setBusy(true);
    try {
      const updated = await window.flippiClipCompilations.deleteVideo(
        eventName,
        compilation.id,
      );
      setCompiledVideoPath(null);
      onUpdated(updated);
    } finally {
      setBusy(false);
    }
  }, [eventName, compilation.id, onUpdated]);

  // Compile progress timer ref
  const compileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearCompileAfter(ms: number) {
    if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    compileTimerRef.current = setTimeout(() => {
      setCompileProgress(null);
      setCompileStatus(null);
    }, ms);
  }

  // Listen for compile progress events
  useEffect(() => {
    const cleanup = window.flippiClipCompilations.onCompileProgress(
      (_event, progress) => {
        if (progress.compilationId !== compilation.id) return;
        setCompileProgress(progress.percent);
        if (progress.status === 'done') {
          if (progress.filePath) {
            setCompiledVideoPath(progress.filePath);
            onUpdatedRef.current({
              ...compilationRef.current,
              compiledVideoPath: progress.filePath,
            });
          }
          setCompileStatus('Done!');
          clearCompileAfter(2000);
        } else if (progress.status === 'error') {
          setCompileStatus(progress.error ?? 'Failed');
          clearCompileAfter(5000);
        }
      },
    );
    return cleanup;
  }, [compilation.id]);

  const handleCompile = useCallback(async () => {
    if (clips.length === 0) return;
    setCompileProgress(0);
    setCompileStatus(null);
    try {
      await window.flippiClipCompilations.compile(eventName, compilation.id);
    } catch (err: any) {
      setCompileStatus(err?.message ?? 'Compilation failed');
      clearCompileAfter(5000);
    }
  }, [eventName, compilation.id, clips.length]);

  const createdClipCount = clips.filter((c) => c.clip.outputPath).length;

  return (
    <div className="pf-set-card">
      {/* Title + Description */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {onToggleSelect && (
          <input
            type="checkbox"
            className="pf-replay-clip-checkbox"
            checked={selected}
            onChange={() => onToggleSelect(compilation.id)}
            aria-label="Select compilation"
          />
        )}
        <input
          className="pf-replay-clip-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleSave}
          disabled={busy}
          placeholder="Compilation title"
          aria-label="Compilation title"
          style={{ flex: 1, fontWeight: 600 }}
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
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '2px 0',
        }}
      >
        {onToggleSelect && (
          <span
            className="pf-replay-clip-checkbox"
            aria-hidden="true"
            style={{ visibility: 'hidden' }}
          />
        )}
        <input
          className="pf-replay-clip-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleSave}
          disabled={busy}
          placeholder="Description"
          aria-label="Compilation description"
          style={{ flex: 1 }}
        />
        <span
          className="pf-clip-expand-btn"
          aria-hidden="true"
          style={{ visibility: 'hidden' }}
        >
          &#x2922;
        </span>
      </div>

      {/* Action bar: compile / play / delete */}
      <div
        className="pf-set-actions"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 0',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {compileProgress != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {compileStatus ? (
                <span
                  style={{ color: 'var(--pf-text-muted)', fontSize: '0.8rem' }}
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
                title="Play compiled compilation video"
              >
                &#9654; Compilation Video
              </button>
              <InlineConfirm
                triggerLabel="Delete Video"
                prompt="Delete video?"
                onConfirm={handleDeleteVideo}
                busy={busy}
                disabled={busy}
              />
            </>
          )}
          {compileProgress == null && !compiledVideoPath && (
            <button
              type="button"
              className="pf-button pf-button-md"
              onClick={handleCompile}
              disabled={busy || createdClipCount === 0}
              title={
                createdClipCount === 0
                  ? 'All clips must have created videos before compiling'
                  : undefined
              }
            >
              Compile ({createdClipCount} clip
              {createdClipCount !== 1 ? 's' : ''})
            </button>
          )}
        </span>
        <InlineConfirm
          triggerLabel="Delete Compilation"
          prompt={
            compiledVideoPath
              ? 'Delete this compilation and its video file?'
              : 'Delete this compilation?'
          }
          onConfirm={handleDeleteCompilation}
          busy={busy}
          disabled={busy}
          sizeClass="pf-button-md"
          style={{ marginLeft: 'auto' }}
        />
      </div>

      {status && <span className="pf-status-message">{status}</span>}

      {/* Clips list */}
      <div className="pf-set-games">
        {clips.length === 0 && (
          <div
            style={{
              color: 'var(--pf-text-muted)',
              fontStyle: 'italic',
              padding: 8,
            }}
          >
            No clips in this compilation
          </div>
        )}
        {clips.map((clipEntry, idx) => {
          const { clip, slpGameData } = clipEntry;
          const duration = clip.endSeconds - clip.startSeconds;
          const slpFileName = clip.slpPath.split(/[\\/]/).pop() ?? clip.slpPath;
          const stageName = slpGameData
            ? getStageName(slpGameData.stageId ?? null)
            : '';
          return (
            <div
              key={clip.id}
              className="pf-set-game-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '6px 10px',
              }}
            >
              {/* Row 1: clip label + metadata + actions */}
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
                    Clip {idx + 1}
                  </span>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--pf-text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={clip.title || slpFileName}
                  >
                    {clip.title || slpFileName}
                  </span>
                  {stageName && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--pf-text-muted)',
                      }}
                    >
                      {stageName}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--pf-text-muted)',
                    }}
                  >
                    {formatDuration(Math.round(duration))}
                  </span>
                  <span
                    className={`pf-clip-badge ${clip.outputPath ? 'pf-clip-badge--created' : 'pf-clip-badge--preview'}`}
                  >
                    {clip.outputPath ? 'Created' : 'Preview'}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  {clip.outputPath && (
                    <button
                      type="button"
                      className="pf-play-btn"
                      onClick={() => setShowPlayer(clip.outputPath)}
                      title="Play clip"
                      aria-label={`Play clip ${idx + 1}`}
                    >
                      &#9654;
                    </button>
                  )}
                  {!compiledVideoPath && (
                    <button
                      type="button"
                      className="pf-set-remove-btn"
                      onClick={() => handleRemoveClip(clip.id)}
                      disabled={busy}
                      title="Remove from compilation"
                      aria-label={`Remove clip ${idx + 1} from compilation`}
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: match info */}
              {slpGameData && (
                <GameMatchInfo slpGameData={slpGameData} hideWinner />
              )}
            </div>
          );
        })}
      </div>

      {/* Video player modal */}
      {showPlayer && (
        <VideoPlayerModal
          src={localFileUrl(showPlayer)}
          title={title || 'Compilation'}
          onClose={() => setShowPlayer(null)}
        />
      )}

      {/* Expand modal for title + description */}
      {showExpand && (
        <CompilationFieldsExpandModal
          title={title}
          description={description}
          onClose={handleExpandClose}
        />
      )}
    </div>
  );
}

export default memo(ClipCompilationCard);
