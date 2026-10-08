import { Injectable } from '@nestjs/common';
import { CacheService } from '@shared/cache';
import { DatabaseService } from '@shared/database';
import { withTimeout } from '@shared/http';

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
