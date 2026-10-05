import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

export type TimeSeriesPoint = { at: number; value: number };

export type LabeledSeries = {
  key: string;
  labels: Record<string, string>;
  points: TimeSeriesPoint[];
};

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

  /** TS.QUERYINDEX — find keys matching label filters */
  async queryIndex(filters: string[]): Promise<string[]> {
    if (filters.length === 0) {
      return [];
    }
    const result = (await this.cache.raw().sendCommand([
      'TS.QUERYINDEX',
      ...filters,
    ])) as string[] | null;
    return Array.isArray(result) ? result.map(String) : [];
  }

  async infoLabels(key: string): Promise<Record<string, string>> {
    try {
      const info = (await this.cache.raw().sendCommand([
        'TS.INFO',
        key,
      ])) as Array<string | number | Array<string | string[]>>;
      if (!Array.isArray(info)) {
        return {};
      }
      for (let i = 0; i < info.length - 1; i += 2) {
        if (String(info[i]) === 'labels' && Array.isArray(info[i + 1])) {
          const pairs = info[i + 1] as Array<string | string[]>;
          const labels: Record<string, string> = {};
          for (const pair of pairs) {
            if (Array.isArray(pair) && pair.length >= 2) {
              labels[String(pair[0])] = String(pair[1]);
            }
          }
          return labels;
        }
      }
    } catch (error: unknown) {
      this.logger.debug(`TS.INFO failed for ${key}: ${String(error)}`);
    }
    return {};
  }

  async loadMatchingSeries(options: {
    filters: string[];
    from?: string | number;
    to?: string | number;
  }): Promise<LabeledSeries[]> {
    const keys = await this.queryIndex(options.filters);
    const from = options.from ?? '-';
    const to = options.to ?? '+';
    const series: LabeledSeries[] = [];

    for (const key of keys) {
      const [labels, points] = await Promise.all([
        this.infoLabels(key),
        this.readRange(key, from, to),
      ]);
      series.push({ key, labels, points });
    }

    return series;
  }
}
