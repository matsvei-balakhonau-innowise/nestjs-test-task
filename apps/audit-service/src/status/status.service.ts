import { Injectable } from '@nestjs/common';
import { CacheService } from '@shared/cache';
import { DatabaseService } from '@shared/database';

@Injectable()
export class StatusService {
  constructor(
    private readonly database: DatabaseService,
    private readonly cache: CacheService,
  ) {}

  async getStatus() {
    const [mongo, redis] = await Promise.all([
      this.database.ping().then(() => true).catch(() => false),
      this.cache.ping().catch(() => false),
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
}
