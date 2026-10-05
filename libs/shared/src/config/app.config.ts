import { registerAs } from '@nestjs/config';
import type { AppConfiguration } from './configuration.types';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const appConfig = registerAs(
  'app',
  (): AppConfiguration => ({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    mongodb: {
      uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017',
      dbName: process.env.MONGODB_DB ?? 'nestjs_test_task',
    },
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: toNumber(process.env.REDIS_PORT, 6379),
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
    messaging: {
      host: process.env.REDIS_MESSAGING_HOST ?? process.env.REDIS_HOST ?? 'localhost',
      port: toNumber(
        process.env.REDIS_MESSAGING_PORT ?? process.env.REDIS_PORT,
        6379,
      ),
      eventsChannel: process.env.EVENTS_CHANNEL ?? 'service_a_events',
    },
    serviceA: {
      host: process.env.SERVICE_A_HOST ?? '0.0.0.0',
      port: toNumber(process.env.SERVICE_A_PORT, 3001),
    },
    serviceB: {
      host: process.env.SERVICE_B_HOST ?? '0.0.0.0',
      port: toNumber(process.env.SERVICE_B_PORT, 3002),
    },
  }),
);
