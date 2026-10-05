import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Document, Filter, WithId } from 'mongodb';
import { DatabaseService } from '@shared/database';

export interface CatalogRecord extends Document {
  source: string;
  importedAt: Date;
  payload: Record<string, unknown>;
  /** Flattened searchable string built from payload */
  searchText: string;
}

export interface CatalogSearchParams {
  q?: string;
  source?: string;
  page?: number;
  pageSize?: number;
}

export interface CatalogSearchResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: WithId<CatalogRecord>[];
}

const COLLECTION = 'catalog_records';
const BATCH_SIZE = 500;

@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    const collection = this.database.collection<CatalogRecord>(COLLECTION);
    await collection.createIndexes([
      { key: { importedAt: -1 }, name: 'importedAt_desc' },
      { key: { source: 1, importedAt: -1 }, name: 'source_importedAt' },
      {
        key: { searchText: 'text' },
        name: 'searchText_text',
        weights: { searchText: 10 },
      },
    ]);
    this.logger.log('catalog_records indexes ready');
  }

  async insertManyFromFile(
    rows: Record<string, unknown>[],
    source: string,
  ): Promise<{ inserted: number; batches: number }> {
    if (rows.length === 0) {
      return { inserted: 0, batches: 0 };
    }

    const collection = this.database.collection<CatalogRecord>(COLLECTION);
    const importedAt = new Date();
    let inserted = 0;
    let batches = 0;

    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const slice = rows.slice(offset, offset + BATCH_SIZE);
      const docs: CatalogRecord[] = slice.map((payload) => ({
        source,
        importedAt,
        payload,
        searchText: this.buildSearchText(payload),
      }));

      const result = await collection.insertMany(docs, { ordered: false });
      inserted += result.insertedCount;
      batches += 1;
    }

    this.logger.log(`Inserted ${inserted} records from ${source} (${batches} batches)`);
    return { inserted, batches };
  }

  async search(params: CatalogSearchParams): Promise<CatalogSearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
    const filter: Filter<CatalogRecord> = {};

    if (params.source) {
      filter.source = params.source;
    }

    if (params.q?.trim()) {
      filter.$text = { $search: params.q.trim() };
    }

    const collection = this.database.collection<CatalogRecord>(COLLECTION);
    const total = await collection.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const skip = (page - 1) * pageSize;

    const cursor = collection.find(filter);
    if (params.q?.trim()) {
      cursor.project({ score: { $meta: 'textScore' } });
      cursor.sort({ score: { $meta: 'textScore' }, importedAt: -1 });
    } else {
      cursor.sort({ importedAt: -1 });
    }

    const items = await cursor.skip(skip).limit(pageSize).toArray();

    return { page, pageSize, total, totalPages, items };
  }

  private buildSearchText(payload: Record<string, unknown>): string {
    const parts: string[] = [];
    const walk = (value: unknown): void => {
      if (value == null) {
        return;
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        parts.push(String(value));
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(walk);
      }
    };
    walk(payload);
    return parts.join(' ').slice(0, 8_000);
  }
}
