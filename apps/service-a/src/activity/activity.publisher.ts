import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TimeSeriesService } from '@shared/cache';
import {
  EventBusService,
  type BusEvent,
} from '@shared/event-bus';

@Injectable()
export class ActivityPublisher {
  private readonly streamKey =
    process.env.EVENT_STREAM_KEY || 'stream:service-a:actions';

  constructor(
    private readonly eventBus: EventBusService,
    private readonly timeSeries: TimeSeriesService,
  ) {}

  async emit(
    name: string,
    body: Record<string, unknown> = {},
  ): Promise<BusEvent> {
    const event: BusEvent = {
      id: randomUUID(),
      name,
      producer: 'service-a',
      occurredAt: new Date().toISOString(),
      body,
    };

    await this.eventBus.publish(this.streamKey, event);
    await this.timeSeries.record(`ts:a:${name}`, 1, {
      producer: 'service-a',
      name,
    });

    return event;
  }
}
