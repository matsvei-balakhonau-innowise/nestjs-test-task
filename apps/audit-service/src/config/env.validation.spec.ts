import { validateAuditEnv } from './env.validation';

describe('validateAuditEnv', () => {
  it('applies defaults for a minimal env', () => {
    const env = validateAuditEnv({});
    expect(env.AUDIT_PORT).toBe(3002);
    expect(env.MONGO_DB_AUDIT).toBe('nest_audit');
    expect(env.EVENT_GROUP).toBe('audit-consumers');
    expect(env.EVENT_CONSUMER).toBe('audit-1');
  });

  it('accepts explicit valid values', () => {
    const env = validateAuditEnv({
      AUDIT_PORT: '3020',
      EVENT_GROUP: 'custom-group',
      EVENT_CONSUMER: 'worker-2',
    });

    expect(env.AUDIT_PORT).toBe(3020);
    expect(env.EVENT_GROUP).toBe('custom-group');
    expect(env.EVENT_CONSUMER).toBe('worker-2');
  });

  it('rejects an empty mongo uri', () => {
    expect(() => validateAuditEnv({ MONGO_URI: '' })).toThrow(
      /Invalid audit-service environment/,
    );
  });
});
