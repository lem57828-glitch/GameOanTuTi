import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGithubSource } from '../../src/modules/bots-runner/github-source.js';

const sha = 'a'.repeat(40);
const code = 'def make_move(state):\n    return state["legal_moves"][0]';
afterEach(() => vi.unstubAllGlobals());
describe('GitHub immutable source', () => {
  it('fetches only the exact commit and decodes a single Python file', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ sha }))
      .mockResolvedValueOnce(
        Response.json({
          type: 'file',
          encoding: 'base64',
          size: code.length,
          content: Buffer.from(code).toString('base64'),
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchGithubSource(
      { githubRepo: 'https://github.com/example/bots', commitSha: sha },
      'team_alpha',
    );
    expect(result).toEqual({
      sourceCode: code,
      githubRepo: 'https://github.com/example/bots',
      commitSha: sha,
      sourcePath: 'bot.py',
    });
    expect(fetcher.mock.calls[1]?.[0]).toContain(`ref=${sha}`);
    expect(fetcher.mock.calls[0]?.[1].headers.authorization).toBeUndefined();
  });
  it.each([
    'http://localhost/x',
    'https://github.com.evil.test/a/b',
    'https://github.com/a/b?token=x',
    'https://u:p@github.com/a/b',
  ])('rejects arbitrary source URL %s', async (githubRepo) => {
    await expect(fetchGithubSource({ githubRepo, commitSha: sha }, 'team_alpha')).rejects.toThrow();
  });
  it('rejects symlinks and paths that escape the repository', async () => {
    await expect(
      fetchGithubSource(
        { githubRepo: 'https://github.com/a/b', commitSha: sha, sourcePath: '../bot.py' },
        'team_alpha',
      ),
    ).rejects.toThrow();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ sha }))
        .mockResolvedValueOnce(Response.json({ type: 'symlink', encoding: 'base64', content: '' })),
    );
    await expect(
      fetchGithubSource({ githubRepo: 'https://github.com/a/b', commitSha: sha }, 'team_alpha'),
    ).rejects.toThrow(/file Python/);
  });
});
