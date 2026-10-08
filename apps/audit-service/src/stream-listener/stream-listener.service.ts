import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBusService, type StreamMessage } from '@shared/event-bus';
import { AuditStore } from '../audit/audit.store';
import type { AuditEnv } from '../config/env.validation';

@Injectable()
export class StreamListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StreamListener.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly auditStore: AuditStore,
    private readonly config: ConfigService<AuditEnv, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    const streamKey = this.config.get('EVENT_STREAM_KEY', { infer: true });
    const group = this.config.get('EVENT_GROUP', { infer: true });
    const consumer = this.config.get('EVENT_CONSUMER', { infer: true });

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
