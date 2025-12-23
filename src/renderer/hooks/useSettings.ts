import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import log from 'electron-log/renderer';
import type { AppSettings } from '../../main/settings/schema';

type Status = { kind: 'success' | 'error'; message: string } | null;

function stableStringify(obj: unknown): string {
  // Settings are simple objects; stringify is fine for dirty-checking.
  // (If we later add Dates/Maps, we’ll replace this.)
  return JSON.stringify(obj);
}

export default function useSettings() {
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState<AppSettings | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [status, setStatus] = useState<Status>(null);

  const statusTimerRef = useRef<number | null>(null);

  const clearStatusLater = useCallback((ms = 3000) => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => setStatus(null), ms);
  }, []);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setStatus(null);

    try {
      const settings = await window.flippiSettings.get();
      setDraft(settings);
      setSaved(settings);
    } catch (err) {
      log.info('Failed to load settings', err);
      setStatus({ kind: 'error', message: 'Failed to load settings.' });
      clearStatusLater(4000);
    } finally {
      setIsLoading(false);
    }
  }, [clearStatusLater]);

  useEffect(() => {
    reload().catch(() => {});
    return () => {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    };
  }, [reload]);

  const save = useCallback(async () => {
    if (!draft) return;

    setIsSaving(true);
    setStatus(null);

    try {
      const updated = await window.flippiSettings.update(draft);
      setDraft(updated);
      setSaved(updated);
      setStatus({ kind: 'success', message: 'Settings saved.' });
      clearStatusLater(2500);
    } catch (err) {
      log.info('Failed to save settings', err);
      setStatus({ kind: 'error', message: 'Failed to save settings.' });
      clearStatusLater(4000);
    } finally {
      setIsSaving(false);
    }
  }, [draft, clearStatusLater]);

  const reset = useCallback(() => {
    if (!saved) return;
    setDraft(saved);
    setStatus({ kind: 'success', message: 'Reverted changes.' });
    clearStatusLater(2000);
  }, [saved, clearStatusLater]);

  // Update helpers: keep UI code clean
  const update = useCallback((next: AppSettings) => {
    setDraft(next);
  }, []);

  const updateSection = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setDraft((prev) => {
        if (!prev) return prev;
        return { ...prev, [key]: value };
      });
    },
    [],
  );

  const isDirty = useMemo(() => {
    if (!draft || !saved) return false;
    return stableStringify(draft) !== stableStringify(saved);
  }, [draft, saved]);

  return {
    draft,
    saved,

    isLoading,
    isSaving,
    status,

    isDirty,

    reload,
    save,
    reset,

    update,
    updateSection,
  };
}
