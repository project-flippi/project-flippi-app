import {
  defaultServiceStatus,
  type PartialServiceStatus,
  type ServiceStatus,
} from '../../common/statusTypes';

type Listener = (status: ServiceStatus) => void;

let current: ServiceStatus = defaultServiceStatus;
const listeners = new Set<Listener>();

export function getStatus(): ServiceStatus {
  return current;
}

export function setStatus(next: ServiceStatus): void {
  current = next;
  listeners.forEach((fn) => fn(current));
}

export function patchStatus(partial: PartialServiceStatus): void {
  // Merge with care — nested objects need nested merges
  const next: ServiceStatus = {
    ...current,
    ...partial,
    obs: {
      ...current.obs,
      ...(partial.obs ?? {}),
      lastUpdatedAt: Date.now(),
    },
    stack: {
      ...current.stack,
      ...(partial.stack ?? {}),
    },
    clippi: {
      ...current.clippi,
      ...(partial.clippi ?? {}),
    },
    slippi: {
      ...current.slippi,
      ...(partial.slippi ?? {}),
    },
  };

  setStatus(next);
}

export function subscribeStatus(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
