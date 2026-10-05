import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from './redis.constants';

export interface TimeSeriesSample {
  timestamp: number;
  value: number;
}

export interface AddTimeSeriesOptions {
  labels?: Record<string, string>;
  retentionMs?: number;
}

/**
 * Thin wrapper around RedisTimeSeries commands via the official node-redis client.
 * Requires Redis Stack (or Redis with the RedisTimeSeries module).
 */
@Injectable()
export class RedisTimeSeriesService {
  private readonly logger = new Logger(RedisTimeSeriesService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: RedisClientType,
  ) {}

  async ensureKey(
    key: string,
    options: AddTimeSeriesOptions = {},
  ): Promise<void> {
    const exists = await this.client.exists(key);
    if (exists) {
      return;
    }

    const args: Array<string | number> = ['TS.CREATE', key];
    if (options.retentionMs != null) {
      args.push('RETENTION', options.retentionMs);
    }
    if (options.labels && Object.keys(options.labels).length > 0) {
      args.push('LABELS');
      for (const [label, value] of Object.entries(options.labels)) {
        args.push(label, value);
      }
    }

    try {
      await this.client.sendCommand(args.map(String));
    } catch (error) {
      // Key may have been created concurrently
      this.logger.debug(`TS.CREATE skipped for ${key}: ${String(error)}`);
    }
  }

  async add(
    key: string,
    value: number,
    timestamp: number | '*' = '*',
    options: AddTimeSeriesOptions = {},
  ): Promise<number> {
    await this.ensureKey(key, options);

    const args: string[] = [
      'TS.ADD',
      key,
      String(timestamp),
      String(value),
    ];

    if (options.labels && Object.keys(options.labels).length > 0) {
      args.push('LABELS');
      for (const [label, labelValue] of Object.entries(options.labels)) {
        args.push(label, labelValue);
      }
    }

    const result = await this.client.sendCommand(args);
    return Number(result);
  }

  async range(
    key: string,
    fromTimestamp = '-',
    toTimestamp = '+',
  ): Promise<TimeSeriesSample[]> {
    const result = (await this.client.sendCommand([
      'TS.RANGE',
      key,
      String(fromTimestamp),
      String(toTimestamp),
    ])) as Array<[number | string, number | string]>;

    if (!Array.isArray(result)) {
      return [];
    }

    return result.map(([timestamp, value]) => ({
      timestamp: Number(timestamp),
      value: Number(value),
    }));
  }
}
