import { test, expect } from '@playwright/test';

test('real submission and both demo/Python practice matches finish through the UI', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Đăng nhập bằng Nguyễn An', exact: true }).click();
  await expect(page).toHaveURL(/\/team$/);
  await page.goto('/bots');

  const sampleRow = page.getByRole('row').filter({ hasText: 'Alpha v2 — ưu tiên ăn quân' });
  await sampleRow.getByRole('button', { name: 'Đấu thử', exact: true }).click();
  await page.getByRole('button', { name: 'Bắt đầu đấu ngay' }).click();
  await expect(page.getByText('Hoàn thành', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Đóng', exact: true }).last().click();

  const label = `Greedy live check ${Date.now()}`;
  await page.getByRole('button', { name: '+ Nộp phiên bản mới' }).click();
  await page.getByLabel('Tên phiên bản / Nhãn chiến thuật').fill(label);
  await page.locator('textarea').fill(`def make_move(state):
    # Lấy danh sách nước đi hợp lệ do Trọng tài cung cấp
    moves = state.get("legal_moves", [])
    for m in moves:
        if m.get("capture"):
            return m
    return moves[0]
`);
  const submission = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/bots') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Xác nhận nộp bot' }).click();
  const submitted = await submission;
  expect(submitted.ok(), await submitted.text()).toBe(true);
  const bot = (await submitted.json()).data;
  expect(['pending', 'valid']).toContain(bot.status);
  const row = page.getByRole('row').filter({ hasText: label });
  await expect(row.getByRole('button', { name: 'Đấu thử', exact: true })).toBeEnabled({ timeout: 30_000 });
  await row.getByRole('button', { name: 'Đấu thử', exact: true }).click();
  const creation = page.waitForResponse(
    (r) => r.url().endsWith(`/bots/${bot.id}/test-runs`) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Bắt đầu đấu ngay' }).click();
  const created = await creation;
  expect(created.ok(), await created.text()).toBe(true);
  const run = (await created.json()).data;
  await expect(page.getByText('Hoàn thành', { exact: true })).toBeVisible({ timeout: 30_000 });
  const detail = await page.request.get(`/api/v1/test-runs/${run.id}`);
  const result = (await detail.json()).data;
  expect(result.status).toBe('succeeded');
  expect(result.plies).toBeGreaterThan(0);
  expect(result.events).toHaveLength(result.plies);
  console.log(
    JSON.stringify({
      botId: bot.id,
      version: bot.version,
      runId: run.id,
      status: result.status,
      plies: result.plies,
      winner: result.winner,
      reason: result.reason,
    }),
  );
});
