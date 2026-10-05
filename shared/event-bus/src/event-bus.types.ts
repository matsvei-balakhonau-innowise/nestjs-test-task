export interface BusEvent {
  id: string;
  name: string;
  producer: 'service-a' | 'service-b';
  occurredAt: string;
  body: Record<string, unknown>;
}

export interface StreamMessage {
  streamId: string;
  event: BusEvent;
}
