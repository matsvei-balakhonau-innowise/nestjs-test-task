import { AsyncLocalStorage } from 'async_hooks';

export interface CorrelationStore {
  correlationId: string;
  requestId: string;
  instanceId: string;
  service: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

export function runWithCorrelation<T>(
  store: CorrelationStore,
  fn: () => T,
): T {
  return storage.run(store, fn);
}

export function getCorrelation(): CorrelationStore | undefined {
  return storage.getStore();
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
