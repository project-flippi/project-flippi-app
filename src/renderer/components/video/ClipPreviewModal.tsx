import type {
  ChangeEvent as ReactChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useFocusTrap from '../../hooks/useFocusTrap';
import useAutoReset from '../../hooks/useAutoReset';

function formatTimeValue(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatClipTime(seconds: number): string {
  if (seconds < 60) return seconds.toFixed(1);
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}

interface ClipPreviewModalProps {
  src: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  clipId: string;
  eventName: string;
  onClose: () => void;
  onTimesUpdated?: (newStart: number, newEnd: number) => void;
}

export default function ClipPreviewModal({
  src,
  title,
  startSeconds,
  endSeconds,
  clipId,
  eventName,
  onClose,
  onTimesUpdated,
}: ClipPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const focusTrapRef = useFocusTrap<HTMLDivElement>();
  const seekBarRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | 'seek' | null>(null);
  const overlayMouseDownRef = useRef(false);
  const [cacheBuster] = useState(() => Date.now());
  const videoSrc = `${src}${src.includes('?') ? '&' : '?'}t=${cacheBuster}`;
  const seekedRef = useRef(false);

  // Clip handle state
  const [handleStart, setHandleStart] = useState(startSeconds);
  const [handleEnd, setHandleEnd] = useState(endSeconds);
  const [videoDuration, setVideoDuration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const setSaveStatusAuto = useAutoReset(setSaveStatus, '', 3000);

  // Playback state for custom controls
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const clipDuration = (handleEnd - handleStart).toFixed(1);
  const canRender = videoDuration > 0 && Number.isFinite(videoDuration);

  // ---- Modal close ----

  const handleClose = useCallback(() => {
    const vid = videoRef.current;
    if (vid) {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
    }
    onClose();
  }, [onClose]);

  const handleOverlayMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      overlayMouseDownRef.current = e.target === e.currentTarget;
    },
    [],
  );

  const handleOverlayClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && overlayMouseDownRef.current) {
        handleClose();
      }
      overlayMouseDownRef.current = false;
    },
    [handleClose],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    },
    [handleClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ---- Video event handlers ----

  const handleLoadedMetadata = useCallback(() => {
    const vid = videoRef.current;
    if (vid) {
      setVideoDuration(vid.duration);
      if (!seekedRef.current) {
        vid.currentTime = handleStart;
        seekedRef.current = true;
      }
    }
  }, [handleStart]);

  const handleVideoTimeUpdate = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    setCurrentTime(vid.currentTime);
    // Loop when reaching end handle (skip while dragging)
    if (!dragging.current && vid.currentTime >= handleEnd) {
      vid.currentTime = handleStart;
    }
  }, [handleStart, handleEnd]);

  const handleEnded = useCallback(() => {
    const vid = videoRef.current;
    if (vid && !dragging.current) {
      vid.currentTime = handleStart;
      vid.play().catch(() => {});
    }
  }, [handleStart]);

  // Sync playing state from native events (e.g. if video stalls)
  const handlePlay = useCallback(() => setPlaying(true), []);
  const handlePause = useCallback(() => setPlaying(false), []);

  // ---- Custom controls: play/pause ----

  const togglePlayPause = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, []);

  // ---- Custom controls: volume ----

  const handleVolumeChange = useCallback(
    (e: ReactChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      setVolume(v);
      const vid = videoRef.current;
      if (vid) {
        vid.volume = v;
        if (v > 0 && vid.muted) {
          vid.muted = false;
          setMuted(false);
        }
      }
    },
    [],
  );

  const toggleMute = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setMuted(vid.muted);
  }, []);

  // ---- Custom controls: fullscreen ----

  const toggleFullscreen = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      vid.requestFullscreen().catch(() => {});
    }
  }, []);

  // ---- Unified seek bar: drag for seek, S handle, E handle ----

  const calcFraction = useCallback((clientX: number) => {
    if (!seekBarRef.current) return 0;
    const rect = seekBarRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const startDrag = useCallback(
    (e: ReactMouseEvent, which: 'start' | 'end' | 'seek') => {
      e.preventDefault();
      e.stopPropagation();
      dragging.current = which;
      const vid = videoRef.current;
      if (vid && (which === 'start' || which === 'end')) {
        vid.pause();
      }
    },
    [],
  );

  // Click on the seek bar track to seek
  const handleSeekBarClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (dragging.current) return;
      const vid = videoRef.current;
      if (!vid || !canRender) return;
      const frac = calcFraction(e.clientX);
      vid.currentTime = frac * videoDuration;
      setCurrentTime(frac * videoDuration);
    },
    [canRender, videoDuration, calcFraction],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !canRender) return;
      const frac = calcFraction(e.clientX);
      const seconds = frac * videoDuration;

      if (dragging.current === 'seek') {
        const vid = videoRef.current;
        if (vid) {
          vid.currentTime = seconds;
          setCurrentTime(seconds);
        }
      } else if (dragging.current === 'start') {
        const clamped = Math.max(0, Math.min(seconds, handleEnd - 0.1));
        setHandleStart(clamped);
        const vid = videoRef.current;
        if (vid) vid.currentTime = clamped;
      } else if (dragging.current === 'end') {
        const clamped = Math.min(
          videoDuration,
          Math.max(seconds, handleStart + 0.1),
        );
        setHandleEnd(clamped);
        const vid = videoRef.current;
        if (vid) vid.currentTime = clamped;
      }
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      const wasDragging = dragging.current;
      dragging.current = null;
      if (wasDragging === 'start' || wasDragging === 'end') {
        const vid = videoRef.current;
        if (vid) {
          vid.currentTime = handleStart;
          vid.play().catch(() => {});
        }
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [videoDuration, handleStart, handleEnd, canRender, calcFraction]);

  // Keyboard adjustment for focused S/E handle
  const handleHandleKeyDown = useCallback(
    (e: ReactKeyboardEvent, which: 'start' | 'end') => {
      const step = 0.5;
      let delta = 0;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = step;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -step;
      if (delta === 0) return;
      e.preventDefault();

      if (which === 'start') {
        setHandleStart((prev) => {
          const next = Math.max(0, Math.min(prev + delta, handleEnd - 0.1));
          const vid = videoRef.current;
          if (vid) vid.currentTime = next;
          return next;
        });
      } else {
        setHandleEnd((prev) => {
          const next = Math.min(
            videoDuration,
            Math.max(prev + delta, handleStart + 0.1),
          );
          const vid = videoRef.current;
          if (vid) vid.currentTime = next;
          return next;
        });
      }
    },
    [handleStart, handleEnd, videoDuration],
  );

  // ---- Save / Reset ----

  const handleSaveTimes = useCallback(async () => {
    setSaving(true);
    try {
      await window.flippiReplayClips.update(eventName, clipId, {
        startSeconds: handleStart,
        endSeconds: handleEnd,
      });
      setSaveStatusAuto('Saved');
      onTimesUpdated?.(handleStart, handleEnd);
    } catch (err: any) {
      setSaveStatusAuto(err?.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }, [
    handleStart,
    handleEnd,
    eventName,
    clipId,
    onTimesUpdated,
    setSaveStatusAuto,
  ]);

  const handleReset = useCallback(() => {
    setHandleStart(startSeconds);
    setHandleEnd(endSeconds);
    const vid = videoRef.current;
    if (vid) {
      vid.currentTime = startSeconds;
      vid.play().catch(() => {});
    }
  }, [startSeconds, endSeconds]);

  // ---- Percentages for bar positions ----

  const playheadPct = canRender ? (currentTime / videoDuration) * 100 : 0;
  const startPct = canRender ? (handleStart / videoDuration) * 100 : 0;
  const endPct = canRender ? (handleEnd / videoDuration) * 100 : 100;

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="pf-video-modal-overlay"
      onClick={handleOverlayClick}
      onMouseDown={handleOverlayMouseDown}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Clip preview: ${title}`}
      ref={focusTrapRef}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="pf-video-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pf-video-modal-header">
          <span className="pf-video-modal-title">
            {title || 'Clip Preview'}
          </span>
          <button
            type="button"
            className="pf-video-modal-close"
            onClick={handleClose}
            aria-label="Close clip preview"
          >
            &times;
          </button>
        </div>

        {/* Video without native controls */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay
          className="pf-video-modal-player"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleVideoTimeUpdate}
          onEnded={handleEnded}
          onPlay={handlePlay}
          onPause={handlePause}
        />

        {/* Custom controls bar */}
        <div className="pf-custom-controls">
          <button
            type="button"
            className="pf-ctrl-btn"
            onClick={togglePlayPause}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '\u275A\u275A' : '\u25B6'}
          </button>

          <span className="pf-ctrl-time">{formatTimeValue(currentTime)}</span>

          {/* Unified seek bar with clip handles */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            className="pf-ctrl-seekbar"
            ref={seekBarRef}
            onClick={handleSeekBarClick}
            onMouseDown={(e) => {
              // Only start seek drag if clicking the track (not a handle)
              if ((e.target as HTMLElement).closest('.pf-clip-timeline-handle'))
                return;
              startDrag(e, 'seek');
            }}
          >
            {/* Played progress */}
            <div
              className="pf-ctrl-seekbar-played"
              style={{ width: `${playheadPct}%` }}
            />
            {/* Clip region highlight */}
            <div
              className="pf-clip-timeline-region"
              style={{
                left: `${startPct}%`,
                width: `${endPct - startPct}%`,
              }}
            />
            {/* Playhead */}
            <div
              className="pf-ctrl-seekbar-head"
              style={{ left: `${playheadPct}%` }}
            />
            {/* Start handle */}
            <div
              className="pf-clip-timeline-handle"
              style={{ left: `${startPct}%` }}
              onMouseDown={(e) => startDrag(e, 'start')}
              onKeyDown={(e) => handleHandleKeyDown(e, 'start')}
              role="slider"
              aria-label="Clip start"
              aria-valuemin={0}
              aria-valuemax={videoDuration}
              aria-valuenow={handleStart}
              tabIndex={0}
            >
              S
            </div>
            {/* End handle */}
            <div
              className="pf-clip-timeline-handle"
              style={{ left: `${endPct}%` }}
              onMouseDown={(e) => startDrag(e, 'end')}
              onKeyDown={(e) => handleHandleKeyDown(e, 'end')}
              role="slider"
              aria-label="Clip end"
              aria-valuemin={0}
              aria-valuemax={videoDuration}
              aria-valuenow={handleEnd}
              tabIndex={0}
            >
              E
            </div>
          </div>

          <span className="pf-ctrl-time">{formatTimeValue(videoDuration)}</span>

          <button
            type="button"
            className="pf-ctrl-btn"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted || volume === 0 ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
          </button>

          <input
            type="range"
            className="pf-ctrl-volume"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            aria-label="Volume"
          />

          <button
            type="button"
            className="pf-ctrl-btn"
            onClick={toggleFullscreen}
            aria-label="Fullscreen"
          >
            &#x26F6;
          </button>
        </div>

        {/* Clip info row */}
        {canRender && (
          <div className="pf-clip-timeline-info">
            <span>{formatClipTime(handleStart)}</span>
            <span className="pf-clip-preview-info">{clipDuration}s</span>
            <span>{formatClipTime(handleEnd)}</span>
            <button
              type="button"
              className="pf-button pf-button-sm"
              onClick={handleReset}
              title="Reset to original clip times"
            >
              Reset
            </button>
            <button
              type="button"
              className="pf-button pf-button-primary pf-button-sm"
              onClick={handleSaveTimes}
              disabled={saving}
            >
              Save
            </button>
            {saveStatus && (
              <span className="pf-status-message">{saveStatus}</span>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
