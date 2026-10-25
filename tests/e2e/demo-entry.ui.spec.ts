import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, mode: { demo: boolean; offline?: boolean }) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (mode.offline && (path === '/health' || path.startsWith('/tournaments'))) {
      await route.fulfill({
        status: 503,
        json: { error: { code: 'INTERNAL_ERROR', message: 'Dịch vụ chưa sẵn sàng' } },
      });
      return;
    }
    let data: unknown;
    if (path === '/health')
      data = { status: 'ok', demoMode: mode.demo, workerAlive: true, serverTime: new Date().toISOString() };
    else if (path === '/session') data = { user: null };
    else if (path === '/dev/accounts')
      data = [{ id: 'btc', displayName: 'BTC Demo', role: 'admin', teamName: null }];
    else if (path === '/tournaments/current')
      data = {
        id: 'tour',
        name: 'Giải trải nghiệm kiểm thử',
        isDemo: true,
        demoKind: 'experience',
        registrationPhase: 'open',
        stages: [],
      };
    else if (path === '/tournaments/tour/competition') data = { levels: [], bracket: [], top4: null };
    else if (path === '/rooms/room_demo_1') {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Không có phòng' } } });
      return;
    } else data = [];
    await route.fulfill({ json: { data } });
  });
}

test('demo: có liên kết đăng nhập mẫu trên desktop và menu điện thoại', async ({ page }) => {
  await fixture(page, { demo: true });
  await page.goto('/tournament');
  await expect(page.getByRole('heading', { name: 'Giải trải nghiệm kiểm thử', exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Điều hướng chính', exact: true })
    .getByRole('link', { name: 'Đăng nhập mẫu', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng BTC Demo', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Điều hướng di động' })
      .getByRole('link', { name: 'Đăng nhập mẫu', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('official: không hiện lối đăng nhập mẫu và không mở trang mẫu', async ({ page }) => {
  await fixture(page, { demo: false });
  await page.goto('/tournament');
  await expect(page.getByRole('heading', { name: 'Giải trải nghiệm kiểm thử', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Đăng nhập mẫu', exact: true })).toHaveCount(0);
  await page.goto('/demo-login');
  await expect(page.getByText('Đăng nhập mẫu không khả dụng', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng BTC Demo', exact: true })).toHaveCount(0);
});

test('API lỗi: báo chưa kết nối thay vì kết luận demo tắt; thử lại tải được tài khoản mẫu', async ({
  page,
}) => {
  const mode = { demo: true, offline: true };
  await fixture(page, mode);
  await page.goto('/demo-login');
  await expect(page.getByText('Chưa kiểm tra được chế độ demo', { exact: true })).toBeVisible();
  await expect(page.getByText('Đăng nhập mẫu không khả dụng', { exact: true })).toHaveCount(0);
  mode.offline = false;
  await page.getByRole('button', { name: 'Thử kết nối lại', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng BTC Demo', exact: true })).toBeVisible();
});

test('API hoạt động lại: nút kết nối lại cũng tải lại giải đấu', async ({ page }) => {
  const mode = { demo: true, offline: true };
  await fixture(page, mode);
  await page.goto('/tournament');
  await expect(page.getByText('Chưa kết nối được dịch vụ', { exact: true })).toBeVisible();
  mode.offline = false;
  await page.getByRole('button', { name: 'Thử kết nối lại', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Giải trải nghiệm kiểm thử', exact: true })).toBeVisible();
});
