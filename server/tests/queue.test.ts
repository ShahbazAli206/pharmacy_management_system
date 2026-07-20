import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueue } from '../src/services/queue';

describe('Job queue abstraction (in-process, no REDIS_URL configured)', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
  });

  it('runs the registered handler for an added job, off the calling stack', async () => {
    const queue = createQueue('test-queue-1');
    let received: unknown = null;
    let resolveDone: () => void;
    const done = new Promise<void>((resolve) => (resolveDone = resolve));

    queue.process<{ foo: string }>('greet', async (data) => {
      received = data;
      resolveDone();
    });

    expect(received).toBeNull(); // nothing has run synchronously yet
    await queue.add('greet', { foo: 'bar' });
    await done;
    expect(received).toEqual({ foo: 'bar' });
  });

  it('drops a job with a warning when no processor is registered for that name', async () => {
    const queue = createQueue('test-queue-2');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await queue.add('nobody-listens', { x: 1 });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nobody-listens'));
    warnSpy.mockRestore();
  });

  it('a failing handler is caught and logged, not thrown back at add()', async () => {
    const queue = createQueue('test-queue-3');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let ran = false;
    queue.process('boom', async () => {
      ran = true;
      throw new Error('kaboom');
    });
    await expect(queue.add('boom', {})).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
    expect(ran).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('routes multiple job names on the same queue to their own handlers', async () => {
    const queue = createQueue('test-queue-4');
    const seen: string[] = [];
    const doneA = new Promise<void>((resolve) => queue.process('a', async () => { seen.push('a'); resolve(); }));
    const doneB = new Promise<void>((resolve) => queue.process('b', async () => { seen.push('b'); resolve(); }));
    await queue.add('b', {});
    await queue.add('a', {});
    await Promise.all([doneA, doneB]);
    expect(seen.sort()).toEqual(['a', 'b']);
  });
});
