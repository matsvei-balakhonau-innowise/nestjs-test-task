import { Injectable } from '@nestjs/common';
import { CacheService } from '@shared/cache';
import { DatabaseService } from '@shared/database';

const HEALTH_TIMEOUT_MS = 2_000;

@Injectable()
export class StatusService {
  constructor(
    private readonly database: DatabaseService,
    private readonly cache: CacheService,
  ) {}

  async getStatus() {
    const [mongo, redis] = await Promise.all([
      this.probe(() => this.database.ping()),
      this.probe(() => this.cache.ping()),
    ]);

    return {
      app: 'audit-service',
      healthy: mongo && redis,
      dependencies: {
        mongo: mongo ? 'reachable' : 'unreachable',
        redis: redis ? 'reachable' : 'unreachable',
      },
      checkedAt: new Date().toISOString(),
    };
  }

  private async probe(check: () => Promise<unknown>): Promise<boolean> {
    try {
      await withTimeout(check(), HEALTH_TIMEOUT_MS);
      return true;
    } catch {
      return false;
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('health check timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
