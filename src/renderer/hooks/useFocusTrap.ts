import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus within a container element.
 * Returns a ref to attach to the container.
 * On mount, focuses the first focusable element (or the container itself).
 * On unmount, returns focus to the element that was focused before the trap.
 */
export default function useFocusTrap<T extends HTMLElement = HTMLDivElement>() {
  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const container = containerRef.current;
    if (!container) return undefined;

    // Focus first focusable element, or the container itself
    const first = container.querySelector<HTMLElement>(FOCUSABLE);
    if (first) {
      first.focus();
    } else {
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !container) return;
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Return focus to previously focused element
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  return containerRef;
}
