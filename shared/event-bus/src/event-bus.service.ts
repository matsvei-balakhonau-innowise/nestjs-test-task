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

const CLAIM_MIN_IDLE_MS = 5_000;
const CLAIM_BATCH_SIZE = 10;

@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  private client!: RedisClientType;
  private polling = false;

  constructor(@Inject(EVENT_BUS_URL) private readonly url: string) {}

  async onModuleInit(): Promise<void> {
    this.client = createClient({ url: this.url }) as RedisClientType;
    this.client.on('error', (err: Error) =>
      this.logger.error(`Event bus Redis error: ${err.message}`),
    );
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
        await this.claimPending(streamKey, group, consumer, handler);

        const results = await this.client.xReadGroup(
          group,
          consumer,
          { key: streamKey, id: '>' },
          { COUNT: CLAIM_BATCH_SIZE, BLOCK: blockMs },
        );

        if (!results) {
          continue;
        }

        for (const stream of results) {
          await this.processEntries(
            streamKey,
            group,
            stream.messages,
            handler,
          );
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

  private async claimPending(
    streamKey: string,
    group: string,
    consumer: string,
    handler: (message: StreamMessage) => Promise<void>,
  ): Promise<void> {
    let start = '0-0';

    while (this.polling) {
      const claimed = await this.client.xAutoClaim(
        streamKey,
        group,
        consumer,
        CLAIM_MIN_IDLE_MS,
        start,
        { COUNT: CLAIM_BATCH_SIZE },
      );

      const messages = (claimed.messages ?? []).filter(
        (entry): entry is NonNullable<typeof entry> => entry != null,
      );

      if (messages.length === 0) {
        break;
      }

      await this.processEntries(streamKey, group, messages, handler);

      const nextId = String(claimed.nextId);
      if (nextId === '0-0' || nextId === start) {
        break;
      }

      start = nextId;
    }
  }

  private async processEntries(
    streamKey: string,
    group: string,
    entries: Array<{ id: string; message: Record<string, string> }>,
    handler: (message: StreamMessage) => Promise<void>,
  ): Promise<void> {
    for (const entry of entries) {
      const raw = entry.message.payload;

      if (!raw) {
        this.logger.warn(
          `Dropping stream message ${entry.id}: missing payload`,
        );
        await this.client.xAck(streamKey, group, entry.id);
        continue;
      }

      let event: BusEvent;

      try {
        event = JSON.parse(raw) as BusEvent;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);

        this.logger.error(
          `Dropping stream message ${entry.id}: invalid JSON (${msg})`,
        );
        await this.client.xAck(streamKey, group, entry.id);
        continue;
      }

      try {
        await handler({ streamId: entry.id, event });
        await this.client.xAck(streamKey, group, entry.id);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Handler failed for stream message ${entry.id}; leaving pending for reclaim: ${msg}`,
        );
      }
    }
  }
}
