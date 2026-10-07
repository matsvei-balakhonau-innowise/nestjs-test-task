import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TimeSeriesService } from '@shared/cache';
import {
  EventBusService,
  type BusEvent,
} from '@shared/event-bus';
import { getCorrelationId } from '@shared/http';

@Injectable()
export class ActivityPublisher {
  private readonly streamKey =
    process.env.EVENT_STREAM_KEY || 'stream:ingest:actions';

  constructor(
    private readonly eventBus: EventBusService,
    private readonly timeSeries: TimeSeriesService,
  ) {}

  async emit(
    name: string,
    body: Record<string, unknown> = {},
  ): Promise<BusEvent> {
    const correlationId = getCorrelationId();
    const event: BusEvent = {
      id: randomUUID(),
      name,
      producer: 'ingest-service',
      occurredAt: new Date().toISOString(),
      body: correlationId ? { ...body, correlationId } : body,
    };

    await this.eventBus.publish(this.streamKey, event);
    await this.timeSeries.record(`ts:ingest:${name}`, 1, {
      producer: 'ingest-service',
      name,
    });

    return event;
  }
}
