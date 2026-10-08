import { Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '@shared/http';
import { CacheService } from './cache.service';

export type TimeSeriesPoint = { at: number; value: number };

export type LabeledSeries = {
  key: string;
  labels: Record<string, string>;
  points: TimeSeriesPoint[];
};

const TARGET_BUCKETS = 96;

type MRangeRow = [
  string,
  Array<[string, string]>,
  Array<[string | number, string | number]>,
];

@Injectable()
export class TimeSeriesService {
  private readonly logger = new Logger(TimeSeriesService.name);

  constructor(private readonly cache: CacheService) {}

  async ensureSeries(
    key: string,
    labels: Record<string, string> = {},
  ): Promise<void> {
    const args: string[] = ['TS.CREATE', key, 'DUPLICATE_POLICY', 'SUM'];

    if (Object.keys(labels).length) {
      args.push('LABELS');

      for (const [k, v] of Object.entries(labels)) {
        args.push(k, v);
      }
    }

    try {
      await this.cache.raw().sendCommand(args);
    } catch (error: unknown) {
      const msg = errorMessage(error);

      if (msg.includes('already exists') || msg.includes('BUSYKEY')) {
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
    try {
      await this.ensureSeries(key, labels);
      await this.cache
        .raw()
        .sendCommand([
          'TS.ADD',
          key,
          '*',
          String(value),
          'ON_DUPLICATE',
          'SUM',
        ]);
    } catch (error: unknown) {
      const msg = errorMessage(error);
      this.logger.error(`TS.ADD failed for ${key}: ${msg}`);
    }
  }

  async readRange(
    key: string,
    from: string | number = '-',
    to: string | number = '+',
    options: { aggregation?: 'count'; bucketMs?: number } = {},
  ): Promise<TimeSeriesPoint[]> {
    const args: string[] = ['TS.RANGE', key, String(from), String(to)];

    if (options.aggregation && options.bucketMs) {
      args.push('AGGREGATION', options.aggregation, String(options.bucketMs));
    }

    const rows = (await this.cache.raw().sendCommand(args)) as Array<
      [string | number, string | number]
    >;

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map(([at, value]) => ({
      at: Number(at),
      value: Number(value),
    }));
  }

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
    bucketMs?: number;
  }): Promise<LabeledSeries[]> {
    if (options.filters.length === 0) {
      return [];
    }

    const from = options.from ?? '-';
    const to = options.to ?? '+';
    const bucketMs = options.bucketMs ?? this.resolveBucketMs(from, to);

    const rows = (await this.cache.raw().sendCommand([
      'TS.MRANGE',
      String(from),
      String(to),
      'WITHLABELS',
      'AGGREGATION',
      'count',
      String(bucketMs),
      'FILTER',
      ...options.filters,
    ])) as MRangeRow[] | null;

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map(([key, labelPairs, points]) => ({
      key: String(key),
      labels: this.pairsToLabels(labelPairs),
      points: Array.isArray(points)
        ? points.map(([at, value]) => ({
            at: Number(at),
            value: Number(value),
          }))
        : [],
    }));
  }

  private pairsToLabels(
    pairs: Array<[string, string]> | null | undefined,
  ): Record<string, string> {
    const labels: Record<string, string> = {};

    if (!Array.isArray(pairs)) {
      return labels;
    }

    for (const pair of pairs) {
      if (Array.isArray(pair) && pair.length >= 2) {
        labels[String(pair[0])] = String(pair[1]);
      }
    }

    return labels;
  }

  private resolveBucketMs(
    from: string | number,
    to: string | number,
  ): number {
    const fromMs =
      from === '-' || from === undefined
        ? Date.now() - 7 * 24 * 60 * 60 * 1000
        : Number(from);
    const toMs =
      to === '+' || to === undefined ? Date.now() : Number(to);

    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      return 60 * 60 * 1000;
    }

    const span = toMs - fromMs;
    return Math.max(1000, Math.ceil(span / TARGET_BUCKETS));
  }
}
