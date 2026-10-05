import { Injectable } from '@nestjs/common';
import { MongoService, RedisService } from '@app/shared';

@Injectable()
export class HealthService {
  constructor(
    private readonly mongo: MongoService,
    private readonly redis: RedisService,
  ) {}

  async check() {
    const mongoOk = await this.mongo
      .getDb()
      .command({ ping: 1 })
      .then(() => true)
      .catch(() => false);
    const redisOk = await this.redis
      .ping()
      .then((result) => result === 'PONG')
      .catch(() => false);

    return {
      service: 'service-a',
      status: mongoOk && redisOk ? 'ok' : 'degraded',
      checks: {
        mongodb: mongoOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
