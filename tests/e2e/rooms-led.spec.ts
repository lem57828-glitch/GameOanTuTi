import { expect, test, type Page } from '@playwright/test';
import type { RoomListItem } from '@arena/contracts';

function room(id: string, title: string, status: RoomListItem['status'], isDemo = false): RoomListItem {
  return {
    roomId: id,
    title,
    status,
    isDemo,
    teams: { a: { id: 'alpha', name: 'Đội Alpha' }, b: { id: 'beta', name: 'Đội Beta' } },
    updatedAt: '2026-10-25T10:00:00.000Z',
  };
}

async function setup(
  page: Page,
  options: { admin?: boolean; partial?: boolean; failOpen?: boolean; failList?: boolean } = {},
) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let rooms = [room('old', 'Trận Alpha đã kết thúc', 'finished', true)];
  let waiting = 2;
  let calls = 0;
  let listFails = options.failList;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown;
    if (path === '/session')
      data = {
        user: options.admin
          ? {
              id: 'btc',
              displayName: 'Ban tổ chức',
              role: 'admin',
              emailVerified: true,
              profileComplete: true,
              demo: false,
              teamId: null,
            }
          : null,
      };
    else if (path === '/health') data = { demoMode: false, workerAlive: true };
    else if (path === '/notifications') data = { unread: 0 };
    else if (path === '/rooms') {
      if (listFails) {
        await route.fulfill({
          status: 503,
          json: { error: { code: 'INTERNAL_ERROR', message: 'API phòng tạm ngắt' } },
        });
        return;
      }
      data = rooms;
    } else if (path === '/admin/tournaments')
      data = [{ id: 'tour', name: 'Giải kiểm tra', status: 'running' }];
    else if (path === '/admin/tournaments/tour/matches/summary')
      data = {
        pending: 2,
        notOpened: waiting,
        selecting: 2 - waiting,
        running: 0,
        paused: 0,
        completed: 0,
        byGame: [],
      };
    else if (path === '/admin/tournaments/tour/matches/open') {
      calls++;
      if (options.failOpen) {
        await route.fulfill({
          status: 409,
          json: { error: { code: 'CONFLICT', message: 'Cặp chưa tới lượt thi' } },
        });
        return;
      }
      rooms = [...rooms, room('new', 'Vòng mới Alpha vs Beta', 'waiting')];
      waiting = options.partial ? 1 : 0;
      data = {
        opened: options.partial ? 1 : 2,
        skipped: options.partial ? 1 : 0,
        errors: options.partial ? [{ pairingId: 'pair-b', error: 'Cặp thiếu đối thủ' }] : [],
      };
    } else throw new Error(`Unexpected API route: ${route.request().method()} ${path}`);
    await route.fulfill({ json: { data } });
  });
  return {
    errors,
    calls: () => calls,
    restoreList: () => {
      listFails = false;
    },
  };
}

test('danh sách công khai giữ tìm kiếm, chuyển bảng và liên kết phòng cũ', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/rooms');
  const title = page.getByRole('link', { name: 'Trận Alpha đã kết thúc', exact: true });
  await expect(title).toHaveAttribute('href', '/rooms/old');
  await page.getByRole('button', { name: 'Bảng', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Tìm phòng hoặc tên đội' }).fill('khong ton tai');
  await expect(page.getByText('Không có phòng phù hợp', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).first().click();
  await expect(title).toBeVisible();
  await page.getByRole('searchbox', { name: 'Tìm phòng hoặc tên đội' }).fill('doi alpha');
  await expect(title).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở phòng cho các cặp đang chờ' })).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('BTC mở phòng qua API cũ, cập nhật ngay và bỏ bộ lọc che phòng mới', async ({ page }) => {
  const state = await setup(page, { admin: true });
  await page.goto('/rooms?q=khongco&kind=demo&status=finished&view=table');
  await page.getByRole('button', { name: 'Mở phòng cho các cặp đang chờ' }).click();
  await expect(page.getByText('Đã mở 2 phòng thi đấu', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vòng mới Alpha vs Beta' })).toHaveAttribute(
    'href',
    '/rooms/new',
  );
  await expect(page.getByRole('link', { name: 'Trận Alpha đã kết thúc' })).toBeVisible();
  await expect(page).toHaveURL(/\/rooms\?view=table$/);
  await expect(page.getByRole('button', { name: 'Mở phòng cho các cặp đang chờ' })).toBeDisabled();
  expect(state.calls()).toBe(1);
  expect(state.errors).toEqual([]);
});

test('mở một phần báo lỗi từng cặp và vẫn hiện phòng đã mở', async ({ page }) => {
  await setup(page, { admin: true, partial: true });
  await page.goto('/rooms');
  await page.getByRole('button', { name: 'Mở phòng cho các cặp đang chờ' }).click();
  await expect(page.getByText('Đã mở 1 phòng, còn cặp chưa mở được', { exact: true })).toBeVisible();
  await expect(page.getByText('pair-b: Cặp thiếu đối thủ', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vòng mới Alpha vs Beta' })).toBeVisible();
});

test('lỗi mở phòng không xóa danh sách hoặc giả báo thành công', async ({ page }) => {
  await setup(page, { admin: true, failOpen: true });
  await page.goto('/rooms');
  await page.getByRole('button', { name: 'Mở phòng cho các cặp đang chờ' }).click();
  await expect(page.getByText('Cặp chưa tới lượt thi', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Trận Alpha đã kết thúc' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vòng mới Alpha vs Beta' })).toHaveCount(0);
});

test('danh sách lỗi mạng có thể tải lại', async ({ page }) => {
  const state = await setup(page, { failList: true });
  await page.goto('/rooms');
  await expect(page.getByText('Không tải được danh sách phòng', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  state.restoreList();
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Trận Alpha đã kết thúc' })).toBeVisible();
});

async function ledPixels(page: Page, selector = '.ba-header .led-canvas') {
  return page.locator(selector).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('LED canvas unavailable');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    let lit = 0;
    for (let index = 0; index < pixels.length; index++) {
      hash = Math.imul(hash ^ pixels[index]!, 16777619);
      if (index % 4 === 3 && pixels[index]! > 0) lit++;
    }
    return { hash, lit };
  });
}

test('LED theo module nam trong do hoa va khong lan vung doc tren desktop va mobile', async ({ page }) => {
  const state = await setup(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/rooms');
    const led = page.locator('.sector-hero [data-led-variant="rooms"]');
    await expect(led).toBeVisible();
    const layout = await led.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const art = element.parentElement!.getBoundingClientRect();
      const copy = element
        .closest('.sector-hero')!
        .querySelector('.sector-hero-copy')!
        .getBoundingClientRect();
      return {
        fits:
          bounds.left >= art.left &&
          bounds.right <= art.right &&
          bounds.top >= art.top &&
          bounds.bottom <= art.bottom,
        separated:
          bounds.right <= copy.left ||
          bounds.left >= copy.right ||
          bounds.bottom <= copy.top ||
          bounds.top >= copy.bottom,
        pageFits: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    expect(layout).toEqual({ fits: true, separated: true, pageFits: true });
  }
  expect(state.errors).toEqual([]);
});

test('LED moi phong doc lap va giu instance khi tai lai danh sach', async ({ page }) => {
  const state = await setup(page, { admin: true });
  await page.goto('/rooms');
  await page.locator('.room-card .led-canvas').evaluate((element) => {
    element.setAttribute('data-retained', 'yes');
  });
  await page.getByRole('button', { name: 'Mở phòng cho các cặp đang chờ' }).click();
  const leds = page.locator('.room-card [data-led-variant="room-card"]');
  await expect(leds).toHaveCount(2);
  await expect(page.locator('.room-card .led-canvas[data-retained="yes"]')).toHaveCount(1);
  const instances = await leds.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-led-instance')),
  );
  expect(new Set(instances).size).toBe(2);
  const selector = (index: number) => '.room-card:nth-child(' + (index + 1) + ') .led-canvas';
  await page.locator('.room-grid').scrollIntoViewIfNeeded();
  for (const index of [0, 1]) {
    await expect.poll(async () => (await ledPixels(page, selector(index))).lit).toBeGreaterThan(0);
    const hash = (await ledPixels(page, selector(index))).hash;
    await expect.poll(async () => (await ledPixels(page, selector(index))).hash).not.toBe(hash);
  }
  expect((await ledPixels(page, selector(0))).hash).not.toBe((await ledPixels(page, selector(1))).hash);
  expect(state.calls()).toBe(1);
  expect(state.errors).toEqual([]);
});

test('LED tự chạy khi mở trang và đổi pixel liên tục', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/rooms');
  const strip = page.locator('.ba-header .led-accent');
  await expect(strip).toHaveAttribute('data-led-motion', 'running');
  await expect.poll(async () => (await ledPixels(page)).lit).toBeGreaterThan(0);
  const first = (await ledPixels(page)).hash;
  await expect.poll(async () => (await ledPixels(page)).hash).not.toBe(first);
  const frameSelector = '.sector-hero .led-canvas';
  await expect.poll(async () => (await ledPixels(page, frameSelector)).lit).toBeGreaterThan(0);
  const firstFrame = (await ledPixels(page, frameSelector)).hash;
  await expect.poll(async () => (await ledPixels(page, frameSelector)).hash).not.toBe(firstFrame);
  expect(state.errors).toEqual([]);
});

test('giảm chuyển động theo thiết bị: LED vẫn tự chuyển động mà không cần bật', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await setup(page);
  await page.goto('/rooms');
  const strip = page.locator('.ba-header .led-accent');
  await expect(strip).toHaveAttribute('data-led-motion', 'running');
  await expect.poll(async () => (await ledPixels(page)).lit).toBeGreaterThan(0);
  const first = (await ledPixels(page)).hash;
  await expect.poll(async () => (await ledPixels(page)).hash).not.toBe(first);
  expect(state.errors).toEqual([]);
});

test('thiết bị giảm chuyển động: LED luôn chạy, các hiệu ứng trang vẫn tôn trọng hệ thống', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await page.goto('/rooms');
  const strip = page.locator('.ba-header .led-accent');
  await expect(strip).toHaveAttribute('data-led-motion', 'running');
  // Các hiệu ứng giao diện khác vẫn theo cài đặt giảm chuyển động của thiết bị
  await expect(page.locator('html')).toHaveAttribute('data-arena-motion', 'still');
  const first = (await ledPixels(page)).hash;
  await expect.poll(async () => (await ledPixels(page)).hash).not.toBe(first);
  await page.reload();
  await expect(strip).toHaveAttribute('data-led-motion', 'running');
  const reloaded = (await ledPixels(page)).hash;
  await expect.poll(async () => (await ledPixels(page)).hash).not.toBe(reloaded);
});

test('trang chủ: LED viền bàn cờ luôn tự chạy chuyển động mà không cần bật', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  const frame = page.locator('.arena .led-accent--frame');
  await expect(frame).toHaveAttribute('data-led-motion', 'running');
  await expect.poll(async () => (await ledPixels(page, '.arena .led-canvas')).lit).toBeGreaterThan(0);
  const first = (await ledPixels(page, '.arena .led-canvas')).hash;
  await expect.poll(async () => (await ledPixels(page, '.arena .led-canvas')).hash).not.toBe(first);
});

test('trang chủ: LED bàn cờ tách nhịp header và không lấn tiêu đề hoặc điều khiển', async ({ page }) => {
  const state = await setup(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.locator('.arena-board-frame .led-canvas')).toBeVisible();
    const bounds = await page.evaluate(() => {
      const frame = document.querySelector('.arena-board-frame')!;
      const led = frame.querySelector('.led-accent')!;
      const header = document.querySelector('.ba-header .led-accent')!;
      const frameBounds = frame.getBoundingClientRect();
      const titleBounds = document.querySelector('.arena-header')!.getBoundingClientRect();
      const captionBounds = document.querySelector('.board-caption')!.getBoundingClientRect();
      const boardBounds = frame.querySelector('.board-svg')!.getBoundingClientRect();
      return {
        separated: titleBounds.bottom <= frameBounds.top && captionBounds.top >= frameBounds.bottom,
        contained:
          boardBounds.left >= frameBounds.left &&
          boardBounds.right <= frameBounds.right &&
          boardBounds.top >= frameBounds.top &&
          boardBounds.bottom <= frameBounds.bottom,
        pageFits: document.documentElement.scrollWidth <= window.innerWidth,
        headerPeriod: getComputedStyle(header).getPropertyValue('--led-lap-seconds'),
        boardPeriod: getComputedStyle(led).getPropertyValue('--led-lap-seconds'),
        headerDirection: getComputedStyle(header).getPropertyValue('--led-direction'),
        boardDirection: getComputedStyle(led).getPropertyValue('--led-direction'),
      };
    });
    expect(bounds.separated).toBe(true);
    expect(bounds.contained).toBe(true);
    expect(bounds.pageFits).toBe(true);
    expect(bounds.headerPeriod).not.toBe(bounds.boardPeriod);
    expect(bounds.headerDirection).not.toBe(bounds.boardDirection);
  }
  expect(state.errors).toEqual([]);
});

test('nút có phản hồi hover nhưng giữ nguyên link và thao tác trình diễn nước đi', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-arena-motion', 'full');
  const action = page.locator('.hero-actions .button').first();
  const href = await action.getAttribute('href');
  await action.hover();
  await expect
    .poll(() => action.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42))
    .toBeCloseTo(-2);
  await expect
    .poll(() => action.evaluate((element) => getComputedStyle(element, '::before').animationName))
    .toBe('fx-button-sheen');
  await expect(action).toHaveAttribute('href', href!);
  await page.getByRole('button', { name: 'Chạy 1 lượt mẫu', exact: true }).click();
  await expect(page.locator('.board-svg')).toHaveAttribute('aria-label', /Nước gần nhất:/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await action.hover();
  await expect(action).toHaveCSS('transform', 'none');
  expect(state.errors).toEqual([]);
});
