import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PythonBotProcess } from '../src/runner/python-process.js';

const enabled = process.env.ARENA_TEST_CONTAINER === '1';
const previous = process.env.BOT_SANDBOX_MODE;
describe.skipIf(!enabled)('actual container isolation (Docker/Podman)', () => {
  beforeAll(() => {
    process.env.BOT_SANDBOX_MODE = 'docker';
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.BOT_SANDBOX_MODE;
    else process.env.BOT_SANDBOX_MODE = previous;
  });
  it('blocks network, host secrets and filesystem writes; enforces cgroup limits', async () => {
    const proc = new PythonBotProcess({
      sourceCode: `import os, socket
def make_move(state):
    assert not any(k in os.environ for k in ['DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET', 'GITHUB_BOT_TOKEN'])
    assert not os.path.exists('/bot/.env')
    for path in ['/bot/probe.txt', '/etc/probe.txt']:
        try:
            with open(path, 'w') as f: f.write('blocked')
        except OSError: pass
        else: raise RuntimeError('filesystem writable')
    s = socket.socket()
    s.settimeout(0.1)
    try: s.connect(('1.1.1.1', 80))
    except OSError: pass
    else: raise RuntimeError('network reachable')
    finally: s.close()
    assert int(open('/sys/fs/cgroup/memory.max').read()) <= 134217728
    assert int(open('/sys/fs/cgroup/pids.max').read()) <= 32
    quota, period = map(int, open('/sys/fs/cgroup/cpu.max').read().split())
    assert quota / period <= 0.2
    return state['legal_moves'][0]
`,
    });
    try {
      await proc.start();
      const result = await proc.requestMove({
        my_side: 'blue',
        turn: 1,
        ply: 0,
        board: {},
        pieces_left: { blue: 10, pink: 10 },
        legal_moves: [{ from: 'A2', to: 'B2', capture: null }],
        last_move: null,
      });
      expect(result).toEqual({ from: 'A2', to: 'B2' });
    } finally {
      proc.terminate();
    }
  }, 15_000);
  it('terminates a bot that exhausts container memory', async () => {
    const proc = new PythonBotProcess({
      sourceCode:
        'def make_move(state):\n    x = bytearray(1024 * 1024 * 1024)\n    return state["legal_moves"][0]',
    });
    try {
      await proc.start();
      await expect(
        proc.requestMove({
          my_side: 'blue',
          turn: 1,
          ply: 0,
          board: {},
          pieces_left: { blue: 10, pink: 10 },
          legal_moves: [{ from: 'A2', to: 'B2', capture: null }],
          last_move: null,
        }),
      ).rejects.toThrow();
    } finally {
      proc.terminate();
    }
  }, 15_000);
});
