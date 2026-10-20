// Giới hạn tần suất đơn giản trong bộ nhớ, theo khóa (IP + thao tác). Đủ cho môi trường demo một tiến trình;
// khi chạy nhiều bản API cần chuyển sang Redis.
import { AppError } from './errors.js';

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): void {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      throw new AppError('RATE_LIMITED', 'Thao tác quá nhanh, thử lại sau ít phút.');
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.hits.clear();
  }
}
