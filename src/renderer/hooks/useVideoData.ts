import { useCallback, useState } from 'react';
import type { VideoDataEntry, CompilationEntry } from '../../common/meleeTypes';

export default function useVideoData() {
  const [clips, setClips] = useState<VideoDataEntry[]>([]);
  const [compilations, setCompilations] = useState<CompilationEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const loadClips = useCallback(async (eventName: string) => {
    if (!eventName) {
      setClips([]);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const data = await window.flippiVideo.getClips(eventName);
      setClips(data);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setClips([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCompilations = useCallback(async (eventName: string) => {
    if (!eventName) {
      setCompilations([]);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const data = await window.flippiVideo.getCompilations(eventName);
      setCompilations(data);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setCompilations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshClips = useCallback(
    (eventName: string) => loadClips(eventName),
    [loadClips],
  );

  const refreshCompilations = useCallback(
    (eventName: string) => loadCompilations(eventName),
    [loadCompilations],
  );

  return {
    clips,
    compilations,
    isLoading,
    error,
    loadClips,
    loadCompilations,
    refreshClips,
    refreshCompilations,
  };
}
