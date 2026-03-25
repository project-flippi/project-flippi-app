import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useFocusTrap from '../../hooks/useFocusTrap';

interface ClipPreviewModalProps {
  src: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  onClose: () => void;
}

export default function ClipPreviewModal({
  src,
  title,
  startSeconds,
  endSeconds,
  onClose,
}: ClipPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const focusTrapRef = useFocusTrap<HTMLDivElement>();
  const [cacheBuster] = useState(() => Date.now());
  const videoSrc = `${src}${src.includes('?') ? '&' : '?'}t=${cacheBuster}`;
  const seekedRef = useRef(false);

  const handleClose = useCallback(() => {
    const vid = videoRef.current;
    if (vid) {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
    }
    onClose();
  }, [onClose]);

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

  // Seek to startSeconds once the video metadata is loaded
  const handleLoadedMetadata = useCallback(() => {
    const vid = videoRef.current;
    if (vid && !seekedRef.current) {
      vid.currentTime = startSeconds;
      seekedRef.current = true;
    }
  }, [startSeconds]);

  // Pause at endSeconds during playback
  const handleTimeUpdate = useCallback(() => {
    const vid = videoRef.current;
    if (vid && vid.currentTime >= endSeconds) {
      vid.pause();
    }
  }, [endSeconds]);

  const handleReplay = useCallback(() => {
    const vid = videoRef.current;
    if (vid) {
      vid.currentTime = startSeconds;
      vid.play();
    }
  }, [startSeconds]);

  const duration = (endSeconds - startSeconds).toFixed(1);

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
          <span className="pf-clip-preview-info">
            {duration}s (frames {Math.max(0, Math.round(startSeconds * 60))}
            &ndash;{Math.round(endSeconds * 60)})
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
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          autoPlay
          className="pf-video-modal-player"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
        />
        <div className="pf-clip-preview-controls">
          <button
            type="button"
            className="pf-button pf-button-sm"
            onClick={handleReplay}
          >
            Replay Clip
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
