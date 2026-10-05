export type ServiceEventType =
  | 'health.check'
  | 'data.fetch'
  | 'data.upload'
  | 'data.search'
  | 'report.generate';

export interface ServiceEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: ServiceEventType | string;
  source: 'service-a' | 'service-b';
  action: string;
  timestamp: string;
  payload?: TPayload;
  meta?: Record<string, unknown>;
}
