import { validationError } from '../../core/errors.js';

const MAX_SOURCE_BYTES = 500_000;

/** GitHub API only: no arbitrary URL fetch or browser-side credentials. */
export async function fetchGithubSource(
  input: { githubRepo: string; commitSha: string; sourcePath?: string },
  teamId: string,
) {
  let url: URL;
  try {
    url = new URL(input.githubRepo);
  } catch {
    throw validationError('URL GitHub không hợp lệ.');
  }
  const parts = url.pathname
    .replace(/\/$/, '')
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    parts.length !== 2 ||
    parts.some((p) => p === '.' || p === '..' || !/^[A-Za-z0-9_.-]+$/.test(p))
  )
    throw validationError('Chỉ nhận URL https://github.com/owner/repository.');
  const repo = parts.join('/');
  const sourcePath = input.sourcePath ?? 'bot.py';
  if (
    !/^[A-Za-z0-9_.\-/]+\.py$/.test(sourcePath) ||
    sourcePath.split('/').some((p) => p === '..' || p === '.' || !p)
  )
    throw validationError('Đường dẫn bot Python không hợp lệ.');
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'BotArena',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  // Private access is explicitly scoped per team; never lend a server token to arbitrary repositories.
  let allow: Record<string, string[]> = {};
  try {
    // Profile launcher đặt biến thiếu thành chuỗi rỗng: coi như chưa cấu hình kho riêng tư.
    allow = JSON.parse(process.env.GITHUB_BOT_PRIVATE_REPOS?.trim() || '{}');
  } catch {
    throw validationError('BTC cần sửa cấu hình GitHub riêng tư.');
  }
  if (Array.isArray(allow[teamId]) && allow[teamId].some((r) => r.toLowerCase() === repo.toLowerCase())) {
    if (!process.env.GITHUB_BOT_TOKEN)
      throw validationError('BTC chưa cấu hình quyền truy cập kho riêng tư.');
    headers.authorization = `Bearer ${process.env.GITHUB_BOT_TOKEN}`;
  }
  async function read(path: string) {
    let response: Response;
    try {
      response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw validationError('Không kết nối được GitHub; thử lại sau.');
    }
    if (!response.ok)
      throw validationError(
        `Không tải được GitHub (${response.status}). Kiểm tra repository, commit và quyền truy cập.`,
      );
    if (Number(response.headers.get('content-length') ?? 0) > 1_000_000)
      throw validationError('Phản hồi GitHub quá lớn.');
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1_000_000) {
        await reader.cancel();
        throw validationError('Phản hồi GitHub quá lớn.');
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    } catch {
      throw validationError('GitHub trả dữ liệu không hợp lệ.');
    }
  }
  const commit = await read(`commits/${input.commitSha}`);
  if (commit.sha !== input.commitSha) throw validationError('Commit SHA không khớp GitHub.');
  const file = await read(
    `contents/${sourcePath.split('/').map(encodeURIComponent).join('/')}?ref=${input.commitSha}`,
  );
  if (
    file.type !== 'file' ||
    file.encoding !== 'base64' ||
    typeof file.content !== 'string' ||
    typeof file.size !== 'number' ||
    file.size > MAX_SOURCE_BYTES
  )
    throw validationError('Chỉ nhận một file Python tối đa 500KB, không nhận symlink/thư mục.');
  const bytes = Buffer.from(file.content, 'base64');
  if (bytes.length > MAX_SOURCE_BYTES) throw validationError('Mã nguồn tối đa 500KB.');
  let sourceCode: string;
  try {
    sourceCode = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw validationError('Mã nguồn cần dùng UTF-8.');
  }
  return { sourceCode, githubRepo: `https://github.com/${repo}`, commitSha: input.commitSha, sourcePath };
}
