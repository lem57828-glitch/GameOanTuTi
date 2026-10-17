const fs = require('node:fs');
const crypto = require('node:crypto');

async function main() {
  const url = new URL(process.env.RAILWAY_IMPORT_URL || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') {
    throw new Error('RAILWAY_IMPORT_URL phải là URL gốc HTTPS của service Railway');
  }
  const token = process.env.MIGRATION_TOKEN;
  if (!token || token.length < 32) throw new Error('Thiếu MIGRATION_TOKEN');
  const data = fs.readFileSync(process.argv[2]);
  const res = await fetch(new URL('/import', url), {
    method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: data,
  });
  if (!res.ok) throw new Error(`Import HTTP ${res.status}: ${await res.text()}`);
  console.log(JSON.stringify({ result: await res.json(), sha256: crypto.createHash('sha256').update(data).digest('hex') }));
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; });
