import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { EVENT_BUS_URL } from './event-bus.tokens';
import type { BusEvent, StreamMessage } from './event-bus.types';

/**
 * Inter-service transport via Redis Streams (XADD / XREADGROUP),
 * not pub/sub — durable, consumer-group friendly.
 */
@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  private client!: RedisClientType;
  private polling = false;

  constructor(@Inject(EVENT_BUS_URL) private readonly url: string) {}

  async onModuleInit(): Promise<void> {
    this.client = createClient({ url: this.url }) as RedisClientType;
    await this.client.connect();
    this.logger.log('Event bus connected');
  }

  async onModuleDestroy(): Promise<void> {
    this.polling = false;
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  async publish(streamKey: string, event: BusEvent): Promise<string> {
    const streamId = await this.client.xAdd(streamKey, '*', {
      payload: JSON.stringify(event),
    });
    return streamId;
  }

  async ensureConsumerGroup(
    streamKey: string,
    group: string,
  ): Promise<void> {
    try {
      await this.client.xGroupCreate(streamKey, group, '0', {
        MKSTREAM: true,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('BUSYGROUP')) {
        throw error;
      }
    }
  }

  /**
   * Long-poll consumer loop. Call once from OnModuleInit of a subscriber.
   */
  async startConsumer(options: {
    streamKey: string;
    group: string;
    consumer: string;
    handler: (message: StreamMessage) => Promise<void>;
    blockMs?: number;
  }): Promise<void> {
    const { streamKey, group, consumer, handler, blockMs = 5000 } = options;
    await this.ensureConsumerGroup(streamKey, group);
    this.polling = true;
    this.logger.log(
      `Consuming stream=${streamKey} group=${group} consumer=${consumer}`,
    );

    while (this.polling) {
      try {
        const results = await this.client.xReadGroup(
          group,
          consumer,
          { key: streamKey, id: '>' },
          { COUNT: 10, BLOCK: blockMs },
        );

        if (!results) {
          continue;
        }

        for (const stream of results) {
          for (const entry of stream.messages) {
            const raw = entry.message.payload;
            if (!raw) {
              continue;
            }
            const event = JSON.parse(raw) as BusEvent;
            await handler({ streamId: entry.id, event });
            await this.client.xAck(streamKey, group, entry.id);
          }
        }
      } catch (error: unknown) {
        if (!this.polling) {
          break;
        }
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Consumer loop error: ${msg}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  stopConsumer(): void {
    this.polling = false;
  }
}
