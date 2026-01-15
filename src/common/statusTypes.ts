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

export type ServiceStatus = {
  obs: ObsServiceStatus;

  // Future-proofing (Step 1 can leave these out or set to minimal types later)
  // clippi?: ...
  // slippi?: ...
  // youtube?: ...
};

export const defaultServiceStatus: ServiceStatus = {
  obs: {
    processRunning: false,
    websocket: 'unknown',
    lastError: undefined,
    lastUpdatedAt: Date.now(),
  },
};
