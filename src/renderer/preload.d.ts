import { ElectronHandler } from '../main/preload';
import type {
  VideoDataEntry,
  CompilationEntry,
  GameEntry,
  PairGamesResult,
  SetEntry,
  GameSet,
  SetPlayerOverride,
} from '../common/meleeTypes';

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electron: ElectronHandler;
    flippiSettings: {
      get: () => Promise<import('../main/settings/schema').AppSettings>;
      update: (
        partial: Partial<import('../main/settings/schema').AppSettings>,
      ) => Promise<import('../main/settings/schema').AppSettings>;
    };
    flippiEvents: {
      list: () => Promise<string[]>;
      create: (
        eventTitle: string,
        venueDesc: string,
      ) => Promise<{ eventName: string; eventPath: string }>;
    };
    flippiStack: {
      start: (eventName: string) => Promise<any>;
      stop: () => Promise<any>;
      switch: (eventName: string) => Promise<any>;
      relaunchClippi: () => Promise<any>;
      relaunchSlippi: () => Promise<any>;
      relaunchObs: () => Promise<any>;
    };
    flippiObs: {
      getSources: () => Promise<
        { name: string; type: string; typeId: string }[]
      >;
      setFeature: (
        feature: 'replayBuffer' | 'recording' | 'streaming',
        enabled: boolean,
      ) => Promise<{ ok: boolean; message?: string }>;
    };
    flippiStatus: {
      get: () => Promise<any>;
      onChanged: (callback: (status: any) => void) => () => void;
    };
    flippiDialog: {
      selectFolder: () => Promise<{ ok: boolean; path: string }>;
    };
    flippiVideo: {
      getServerPort: () => Promise<number>;
      getClips: (eventName: string) => Promise<VideoDataEntry[]>;
      getCompilations: (eventName: string) => Promise<CompilationEntry[]>;
      generateClipData: (
        eventName: string,
      ) => Promise<{ ok: boolean; created: number; message: string }>;
      pairVideoFiles: (
        eventName: string,
      ) => Promise<{ ok: boolean; paired: number; unmatched: number }>;
      updateClip: (
        eventName: string,
        timestamp: string,
        updates: Record<string, any>,
      ) => Promise<{ ok: boolean }>;
      createCompilation: (
        eventName: string,
        options: Record<string, any>,
      ) => Promise<{ ok: boolean; filePath?: string; message: string }>;
      updateCompilation: (
        eventName: string,
        filePath: string,
        updates: Record<string, any>,
      ) => Promise<{ ok: boolean }>;
      aiGenerateTitle: (
        prompt: string,
        eventName: string,
      ) => Promise<{ ok: boolean; title?: string }>;
      aiGenerateDesc: (
        title: string,
      ) => Promise<{ ok: boolean; description?: string }>;
      aiGenerateThumbnail: (
        title: string,
      ) => Promise<{ ok: boolean; thumbnailPath?: string }>;
      getGameEntries: (eventName: string) => Promise<GameEntry[]>;
      pairGameVideos: (eventName: string) => Promise<PairGamesResult>;
      getGameAndSetEntries: (
        eventName: string,
      ) => Promise<{ games: GameEntry[]; sets: SetEntry[] }>;
    };
    flippiSets: {
      getEntries: (eventName: string) => Promise<SetEntry[]>;
      create: (
        eventName: string,
        matchType: string,
        setType: string,
        phase: string,
        roundType: string,
        roundNumber: string,
        playerOverrides: SetPlayerOverride[],
        videoFilePath: string,
      ) => Promise<GameSet>;
      addGame: (
        eventName: string,
        setId: string,
        videoFilePath: string,
      ) => Promise<GameSet>;
      removeGame: (
        eventName: string,
        setId: string,
        videoFilePath: string,
      ) => Promise<GameSet | null>;
      update: (
        eventName: string,
        setId: string,
        updates: Record<string, any>,
      ) => Promise<GameSet>;
      delete: (eventName: string, setId: string) => Promise<void>;
      findForVideo: (
        eventName: string,
        videoFilePath: string,
      ) => Promise<string | null>;
      compile: (eventName: string, setId: string) => Promise<string>;
      deleteVideo: (eventName: string, setId: string) => Promise<GameSet>;
      renameVideo: (eventName: string, setId: string) => Promise<GameSet>;
      onCompileProgress: (
        handler: (
          _event: any,
          progress: {
            setId: string;
            percent: number;
            status: string;
            filePath?: string;
            error?: string;
          },
        ) => void,
      ) => () => void;
    };
  }
}

export {};
