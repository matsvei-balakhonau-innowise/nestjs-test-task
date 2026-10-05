import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

export type TimeSeriesPoint = { at: number; value: number };

@Injectable()
export class TimeSeriesService {
  private readonly logger = new Logger(TimeSeriesService.name);

  constructor(private readonly cache: CacheService) {}

  async ensureSeries(
    key: string,
    labels: Record<string, string> = {},
  ): Promise<void> {
    const args: string[] = ['TS.CREATE', key];
    if (Object.keys(labels).length) {
      args.push('LABELS');
      for (const [k, v] of Object.entries(labels)) {
        args.push(k, v);
      }
    }

    try {
      await this.cache.raw().sendCommand(args);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('already exists') ||
        msg.includes('BUSYKEY') ||
        msg.includes('TSDB')
      ) {
        return;
      }
      throw error;
    }
  }

  async record(
    key: string,
    value: number,
    labels: Record<string, string> = {},
  ): Promise<void> {
    await this.ensureSeries(key, labels);
    try {
      await this.cache.raw().sendCommand(['TS.ADD', key, '*', String(value)]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`TS.ADD failed for ${key}: ${msg}`);
      throw error;
    }
  }

  async readRange(
    key: string,
    from: string | number = '-',
    to: string | number = '+',
  ): Promise<TimeSeriesPoint[]> {
    const rows = (await this.cache.raw().sendCommand([
      'TS.RANGE',
      key,
      String(from),
      String(to),
    ])) as Array<[string | number, string | number]>;

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map(([at, value]) => ({
      at: Number(at),
      value: Number(value),
    }));
  }
}
