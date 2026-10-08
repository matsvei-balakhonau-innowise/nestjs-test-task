import { withTimeout } from './with-timeout';

describe('withTimeout', () => {
  it('resolves when the promise finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 100)).resolves.toBe('ok');
  });

  it('rejects when the promise exceeds the timeout', async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 20),
    ).rejects.toThrow(/timed out after 20ms/);
  });
});
