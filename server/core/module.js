// Khung module. Mỗi module khai báo:
//   name, owner (TV1..TV4), title, migrations (thư mục .sql), routes (bảng API), init(ctx) (đăng ký nghe sự kiện...).
// Mỗi route: { method, path, auth, desc, handler? }
//   - auth: 'public' | 'user' | 'referee' | 'admin'  (referee: trọng tài hoặc admin)
//   - handler: (req, res) => giá trị JSON | Promise. Bỏ trống = chưa làm, tự trả 501 kèm tên người phụ trách.
// Người phụ trách hiện thực API bằng cách viết hàm trong service.js của module mình rồi gắn vào handler.
const express = require('express');
const { h } = require('./http');
const { todo } = require('./errors');
const auth = require('./auth');

const GUARDS = {
  public: [],
  user: [auth.requireAuth],
  referee: [auth.requireRole('referee', 'admin')],
  admin: [auth.requireRole('admin')],
};

function defineModule(def) {
  for (const k of ['name', 'owner', 'title', 'routes']) if (!def[k]) throw new Error(`Module thiếu "${k}"`);
  const router = express.Router();
  for (const r of def.routes) {
    if (!GUARDS[r.auth]) throw new Error(`${def.name} ${r.method} ${r.path}: auth phải là ${Object.keys(GUARDS).join('|')}`);
    const handler = r.handler || (() => todo(def.owner, `${r.method.toUpperCase()} /api${r.path} — ${r.desc}`));
    router[r.method](r.path, ...GUARDS[r.auth], h(handler));
  }
  return {
    ...def,
    router,
    /** Thông tin cho trang tổng quan: API nào đã có handler. */
    summary() {
      return {
        name: def.name, owner: def.owner, title: def.title,
        routes: def.routes.map((r) => ({ method: r.method.toUpperCase(), path: `/api${r.path}`, auth: r.auth, desc: r.desc, done: !!r.handler })),
      };
    },
  };
}

module.exports = { defineModule };
