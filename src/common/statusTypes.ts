export type ConnectionState =
  | 'unknown'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'auth_failed'
  | 'error';

export type ObsServiceStatus = {
  processRunning: boolean; // Step 1 can keep false by default
  websocket: ConnectionState; // Step 1 can keep 'unknown' by default
  lastError?: string;
  lastUpdatedAt: number; // epoch ms
};

export type StackState = {
  running: boolean;
  currentEventName: string | null;
  startedAt: number | null;
};

export type ClippiServiceStatus = {
  processRunning: boolean; // whether Project Clippi process is detected
  obsConnected: boolean | null; // null = unknown (no file / process not running)
  slippiConnected: boolean | null; // null = unknown
  comboDataLinked: boolean; // symlink exists and is valid
  activeEventName: string | null; // which event the symlink points to
  activeFilePath: string | null; // full path to _ActiveClippiComboData/combodata.jsonl
  lastError?: string;
  lastUpdatedAt: number; // epoch ms
};

export type SlippiServiceStatus = {
  processRunning: boolean;
};

export type ServiceStatus = {
  obs: ObsServiceStatus;
  stack: StackState;
  clippi: ClippiServiceStatus;
  slippi: SlippiServiceStatus;
};

export const defaultServiceStatus: ServiceStatus = {
  obs: {
    processRunning: false,
    websocket: 'unknown',
    lastError: undefined,
    lastUpdatedAt: Date.now(),
  },
  stack: {
    running: false,
    currentEventName: null,
    startedAt: null,
  },
  clippi: {
    processRunning: false,
    obsConnected: null,
    slippiConnected: null,
    comboDataLinked: false,
    activeEventName: null,
    activeFilePath: null,
    lastError: undefined,
    lastUpdatedAt: Date.now(),
  },
  slippi: {
    processRunning: false,
  },
};
