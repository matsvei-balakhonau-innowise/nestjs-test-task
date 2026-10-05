import { Transport, type RedisOptions } from '@nestjs/microservices';
import type { AppConfiguration } from '../config/configuration.types';

export const buildRedisMicroserviceOptions = (
  messaging: AppConfiguration['messaging'],
): RedisOptions => ({
  transport: Transport.REDIS,
  options: {
    host: messaging.host,
    port: messaging.port,
  },
});
