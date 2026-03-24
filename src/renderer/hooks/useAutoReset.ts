import { useCallback, useEffect, useRef } from 'react';

/**
 * Returns a setter that auto-resets the value after a delay.
 * Cleans up the timeout on unmount to prevent memory leaks.
 *
 * Usage:
 *   const [status, setStatus] = useState('');
 *   const setStatusAuto = useAutoReset(setStatus, '', 3000);
 *   setStatusAuto('Saved!'); // auto-clears to '' after 3s
 */
export default function useAutoReset<T>(
  setter: (value: T) => void,
  // eslint-disable-next-line no-undef
  resetValue: NoInfer<T>,
  delayMs: number,
): (value: T) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (value: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setter(value);
      timerRef.current = setTimeout(() => setter(resetValue), delayMs);
    },
    [setter, resetValue, delayMs],
  );
}
