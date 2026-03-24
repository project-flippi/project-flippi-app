import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Measures the height of a container element and updates on resize.
 * Returns a ref to attach to the container and the measured height.
 * Falls back to `fallback` until the first measurement.
 */
export default function useContainerHeight(fallback = 400) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(fallback);

  const measure = useCallback(() => {
    if (containerRef.current) {
      setHeight(containerRef.current.clientHeight);
    }
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [measure]);

  return { containerRef, height };
}
