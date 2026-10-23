import { test, expect } from '@playwright/test';

test('submit on a short screen, practice a seeded bot, and surface API failures', async ({ page }) => {
  const bot = {
    id: 'bot_alpha_1',
    teamId: 'team_alpha',
    version: 1,
    label: 'Alpha mẫu',
    status: 'valid',
    sourceHash: 'a'.repeat(64),
    createdAt: new Date().toISOString(),
  };
  let fail = false;
  let submitted = false;
  let started = false;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let data: unknown = {};
    if (path.endsWith('/session'))
      data = { user: { id: 'an', displayName: 'An', role: 'student', teamId: 'team_alpha', demo: true } };
    else if (path.endsWith('/health')) data = { demoMode: true };
    else if (path.endsWith('/bots') && req.method() === 'GET') data = [bot];
    else if (path.endsWith('/bots') && req.method() === 'POST') {
      expect(req.headers()['content-type']).toContain('application/json');
      expect(req.postDataJSON().sourceCode).toContain('make_move');
      submitted = true;
      data = bot;
    } else if (path.endsWith('/test-runs')) {
      expect(req.headers()['content-type']).toContain('application/json');
      started = true;
      if (fail)
        return route.fulfill({
          status: 503,
          json: { error: { message: 'Worker chưa sẵn sàng', code: 'INTERNAL_ERROR' } },
        });
      data = { id: 'run_1', status: 'queued' };
    } else if (path.endsWith('/test-runs/run_1')) {
      data = { id: 'run_1', status: 'succeeded', winner: 'blue', reason: 'goal', plies: 4, events: [] };
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto('/bots');
  await page.getByRole('button', { name: '+ Nộp phiên bản mới' }).click();
  await page.getByLabel('Tên phiên bản / Nhãn chiến thuật').fill('Test');
  await page.locator('textarea').fill('def make_move(state):\n    return state["legal_moves"][0]');
  const submit = page.getByRole('button', { name: 'Xác nhận nộp bot' });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  await submit.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(submitted).toBe(true);
  await page.getByRole('button', { name: 'Đấu thử', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Bắt đầu đấu ngay' }).click();
  await expect(page.getByText('🏆 Bot của bạn (Xanh) THẮNG!')).toBeVisible();
  expect(started).toBe(true);
  await page.getByRole('button', { name: 'Đấu trận khác' }).click();
  fail = true;
  await page.getByRole('button', { name: 'Bắt đầu đấu ngay' }).click();
  await expect(page.getByText('Worker chưa sẵn sàng')).toBeVisible();
});
