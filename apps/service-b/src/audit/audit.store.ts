import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Filter, WithId } from 'mongodb';
import { DatabaseService } from '@shared/database';
import type { BusEvent } from '@shared/event-bus';

export interface AuditEntry {
  eventId: string;
  name: string;
  producer: string;
  occurredAt: Date;
  body: Record<string, unknown>;
  ingestedAt: Date;
  streamId?: string;
}

export interface AuditQuery {
  name?: string;
  producer?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

const COLLECTION = 'audit_entries';

@Injectable()
export class AuditStore implements OnModuleInit {
  private readonly logger = new Logger(AuditStore.name);

  constructor(private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.database.collection<AuditEntry>(COLLECTION).createIndexes([
      { key: { occurredAt: -1 }, name: 'occurredAt_desc' },
      { key: { name: 1, occurredAt: -1 }, name: 'name_occurredAt' },
      { key: { producer: 1, occurredAt: -1 }, name: 'producer_occurredAt' },
      { key: { eventId: 1 }, name: 'eventId_uq', unique: true },
    ]);
    this.logger.log('audit_entries indexes ready');
  }

  async ingest(event: BusEvent, streamId?: string): Promise<AuditEntry> {
    const entry: AuditEntry = {
      eventId: event.id,
      name: event.name,
      producer: event.producer,
      occurredAt: new Date(event.occurredAt),
      body: event.body,
      ingestedAt: new Date(),
      streamId,
    };

    await this.database.collection<AuditEntry>(COLLECTION).updateOne(
      { eventId: event.id },
      { $setOnInsert: entry },
      { upsert: true },
    );

    return entry;
  }

  async search(query: AuditQuery): Promise<WithId<AuditEntry>[]> {
    const filter: Filter<AuditEntry> = {};

    if (query.name) {
      filter.name = query.name;
    }
    if (query.producer) {
      filter.producer = query.producer;
    }
    if (query.from || query.to) {
      filter.occurredAt = {};
      if (query.from) {
        filter.occurredAt.$gte = query.from;
      }
      if (query.to) {
        filter.occurredAt.$lte = query.to;
      }
    }

    return this.database
      .collection<AuditEntry>(COLLECTION)
      .find(filter)
      .sort({ occurredAt: -1 })
      .skip(query.offset ?? 0)
      .limit(Math.min(query.limit ?? 50, 200))
      .toArray();
  }
}
