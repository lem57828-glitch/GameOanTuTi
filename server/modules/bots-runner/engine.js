// ENGINE LUẬT CỜ OTTv2 — TV2 hiện thực (đặc tả mục 6.3). Viết thành hàm thuần (không đọc CSDL) để
// worker, phòng đấu (TV4, vẽ/kiểm tra nước) và kiểm thử dùng chung.
//
// Luật đã thống nhất:
//  - Bàn 9×9 (cột A–I, hàng 1–9). Mỗi bên 3 Búa, 3 Bao, 3 Kéo cố định + 1 quân tùy chọn (vòng 32→4).
//    Sơ loại dùng quân tùy chọn hay bố trí chuẩn 3 Búa–4 Bao–3 Kéo: chưa chốt (Q06). Ô xuất phát quân thứ 10: chưa chốt (Q07).
//  - Đi một quân một ô theo 8 hướng. Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa.
//    Chỉ vào ô trống hoặc ăn quân bị khắc; quân cùng đội, cùng loại hoặc mạnh hơn chặn đường.
//  - Thắng: tới đích (Xanh I9, Hồng A1), ăn hết một loại quân đối phương, hoặc đối phương hết nước.
//  - Lặp thế cờ (cùng bên tới lượt) lần thứ 3 hoặc đủ 200 nước: bên nhiều quân hơn thắng, bằng nhau hòa.
//
// Tham khảo bản cũ: `git show legacy-v1:src/game/board.js` (chỉ để tham khảo, đặc tả yêu cầu xây lại).
const { todo } = require('../../core/errors');

const OWNER = 'TV2';
const GOAL = { blue: 'I9', pink: 'A1' };

/** @returns {{ pieces: Record<string,{side:string,type:string}>, toMove: 'blue'|'pink', ply: number, seen: Record<string,number>, history: any[] }} */
const newGame = (/* { blueExtraType, pinkExtraType, maxPlies } */) => todo(OWNER, 'engine.newGame: dựng thế cờ ban đầu');
/** @returns {Array<{from:string,to:string,capture:string|null}>} */
const legalMoves = (/* state, ruleset */) => todo(OWNER, 'engine.legalMoves');
/** @returns {{ state: object, end: null | { winner: 'blue'|'pink'|null, reason: string } }} */
const applyMove = (/* state, move, ruleset */) => todo(OWNER, 'engine.applyMove + kiểm tra kết thúc');
/** Chuẩn hóa nước bot trả về: dict {from,to} | ["B4","C5"] | "B4-C5". */
const parseMove = (/* value */) => todo(OWNER, 'engine.parseMove');

module.exports = { GOAL, newGame, legalMoves, applyMove, parseMove };
