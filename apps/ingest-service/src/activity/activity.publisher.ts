import { Injectable, Logger } from '@nestjs/common';
import { errorMessage, withTimeout } from '@shared/http';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { TimeSeriesService } from '@shared/cache';
import { EventBusService, type BusEvent } from '@shared/event-bus';
import { getCorrelationId } from '@shared/http';
import type { IngestEnv } from '../config/env.validation';

const ACTIVITY_REDIS_TIMEOUT_MS = 5_000;

@Injectable()
export class ActivityPublisher {
  private readonly logger = new Logger(ActivityPublisher.name);
  private readonly streamKey: string;

  constructor(
    private readonly eventBus: EventBusService,
    private readonly timeSeries: TimeSeriesService,
    config: ConfigService<IngestEnv, true>,
  ) {
    this.streamKey = config.get('EVENT_STREAM_KEY', { infer: true });
  }

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

    try {
      await withTimeout(
        (async () => {
          await this.eventBus.publish(this.streamKey, event);
          await this.timeSeries.record(`ts:ingest:${name}`, 1, {
            producer: 'ingest-service',
            name,
          });
        })(),
        ACTIVITY_REDIS_TIMEOUT_MS,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Activity emit failed for "${name}" (request already succeeded): ${errorMessage(error)}`,
      );
    }

    return event;
  }
}
