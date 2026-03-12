import React, { useRef, useState, useEffect } from 'react';

interface LazyVideoThumbnailProps {
  src: string;
  width: number;
  style?: React.CSSProperties;
}

/**
 * Lazy-loads a video thumbnail. When used inside a virtualized list,
 * items are already unmounted when off-screen, so we eagerly load
 * on mount after a microtask to avoid flooding the browser with
 * simultaneous video metadata requests.
 */
function LazyVideoThumbnail({ src, width, style }: LazyVideoThumbnailProps) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // Small delay so the browser can paint the placeholder first,
    // then load video metadata. This staggers loads when many rows
    // mount at once (initial render / fast scroll).
    const id = requestAnimationFrame(() => {
      if (mountedRef.current) setShouldLoad(true);
    });
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(id);
    };
  }, []);

  return (
    <div style={{ width, ...style }}>
      {shouldLoad ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={src}
          preload="metadata"
          style={{
            width,
            borderRadius: 4,
            backgroundColor: '#111',
            display: 'block',
          }}
          onLoadedMetadata={(e) => {
            const vid = e.currentTarget;
            if (vid.duration > 2) vid.currentTime = 2;
          }}
        />
      ) : (
        <div
          style={{
            width,
            height: Math.round(width * 0.5625),
            borderRadius: 4,
            backgroundColor: '#111',
          }}
        />
      )}
    </div>
  );
}

LazyVideoThumbnail.defaultProps = {
  style: undefined,
};

export default LazyVideoThumbnail;
