export interface BusEvent {
  id: string;
  name: string;
  producer: 'ingest-service' | 'audit-service';
  occurredAt: string;
  body: Record<string, unknown>;
}

export interface StreamMessage {
  streamId: string;
  event: BusEvent;
}
