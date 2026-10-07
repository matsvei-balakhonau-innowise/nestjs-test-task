import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBusService, type StreamMessage } from '@shared/event-bus';
import { AuditStore } from '../audit/audit.store';

@Injectable()
export class StreamListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StreamListener.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly auditStore: AuditStore,
  ) {}

  async onModuleInit(): Promise<void> {
    const streamKey =
      process.env.EVENT_STREAM_KEY || 'stream:ingest:actions';
    const group = process.env.EVENT_GROUP || 'audit-consumers';
    const consumer = process.env.EVENT_CONSUMER || 'audit-1';

    void this.eventBus.startConsumer({
      streamKey,
      group,
      consumer,
      handler: async ({ streamId, event }: StreamMessage) => {
        this.logger.log(`audit ingest name=${event.name} id=${event.id}`);
        await this.auditStore.ingest(event, streamId);
      },
    });
  }

  onModuleDestroy(): void {
    this.eventBus.stopConsumer();
  }
}
