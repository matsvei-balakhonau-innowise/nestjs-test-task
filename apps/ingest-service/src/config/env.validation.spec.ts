import { validateIngestEnv } from './env.validation';

describe('validateIngestEnv', () => {
  it('applies defaults for a minimal env', () => {
    const env = validateIngestEnv({});
    expect(env.INGEST_PORT).toBe(3001);
    expect(env.MONGO_URI).toBe('mongodb://localhost:27017');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.EVENT_STREAM_KEY).toBe('stream:ingest:actions');
    expect(env.PULL_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it('accepts explicit valid values', () => {
    const env = validateIngestEnv({
      INGEST_PORT: '3010',
      MONGO_URI: 'mongodb://mongo:27017',
      MONGO_DB_INGEST: 'custom_ingest',
      REDIS_URL: 'redis://redis:6379',
      PULL_ALLOWED_HOSTS: 'example.com',
      PULL_MAX_BYTES: '2048',
    });

    expect(env.INGEST_PORT).toBe(3010);
    expect(env.MONGO_DB_INGEST).toBe('custom_ingest');
    expect(env.PULL_ALLOWED_HOSTS).toBe('example.com');
    expect(env.PULL_MAX_BYTES).toBe(2048);
  });

  it('rejects an invalid port', () => {
    expect(() => validateIngestEnv({ INGEST_PORT: '70000' })).toThrow(
      /Invalid ingest-service environment/,
    );
  });
});
