// @arena/contracts — hợp đồng dữ liệu dùng chung giữa web, api và worker.
// Đổi hợp đồng: sửa bên phát, bên nhận, docs/CONTRACTS.md và kiểm thử trong cùng một PR (đặc tả M0 mục 9).
export * from './common.js';
export * from './accounts.js';
export * from './bots.js';
export * from './tournaments.js';
export * from './rooms.js';
export * from './events.js';
export * from './system.js';

/** Bản zod mà contracts dùng. Bên dùng CommonJS (API) phải lấy z từ đây để tránh nạp hai bản zod (ESM/CJS). */
export { z } from 'zod';
