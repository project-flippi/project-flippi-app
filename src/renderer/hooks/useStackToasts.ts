import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

export default function useStackToasts(
  isAllGreen: boolean,
  isStackRunning: boolean,
): void {
  const wasAllGreen = useRef(false);
  const hasReachedAllGreen = useRef(false);

  useEffect(() => {
    if (!isStackRunning) {
      wasAllGreen.current = false;
      hasReachedAllGreen.current = false;
      return;
    }

    if (isAllGreen && !wasAllGreen.current) {
      toast.success("Flippi's ready to smash, are you?");
      hasReachedAllGreen.current = true;
    }

    if (!isAllGreen && wasAllGreen.current && hasReachedAllGreen.current) {
      toast.warning(
        'Flippi lost connection to an application, check recording panel',
      );
    }

    wasAllGreen.current = isAllGreen;
  }, [isAllGreen, isStackRunning]);
}
