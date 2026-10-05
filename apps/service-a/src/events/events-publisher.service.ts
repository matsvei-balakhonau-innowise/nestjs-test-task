import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { firstValueFrom } from 'rxjs';
import {
  EVENT_PATTERNS,
  RedisTimeSeriesService,
  type ServiceEvent,
  type ServiceEventType,
} from '@app/shared';
import { EVENT_CLIENT } from './events.constants';

@Injectable()
export class EventsPublisherService {
  constructor(
    @Inject(EVENT_CLIENT) private readonly client: ClientProxy,
    private readonly timeSeries: RedisTimeSeriesService,
  ) {}

  async publish(
    type: ServiceEventType | string,
    action: string,
    payload?: Record<string, unknown>,
  ): Promise<ServiceEvent> {
    const event: ServiceEvent = {
      id: randomUUID(),
      type,
      source: 'service-a',
      action,
      timestamp: new Date().toISOString(),
      payload,
    };

    await firstValueFrom(
      this.client.emit(EVENT_PATTERNS.SERVICE_A_ACTION, event),
    );

    await this.timeSeries.add(
      `ts:service_a:${type}`,
      1,
      '*',
      {
        labels: {
          service: 'service-a',
          type: String(type),
          action,
        },
      },
    );

    return event;
  }
}
