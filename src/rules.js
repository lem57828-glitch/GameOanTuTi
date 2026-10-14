// Bộ luật phía máy chủ: chỉ máy chủ phân xử lượt, không nhận kết quả do bot/trình duyệt tự khai.

const MOVE_RE = /^[A-Z][A-Z0-9_]{0,19}$/;

function validateRuleset({ moves, beats }) {
  if (!Array.isArray(moves) || moves.length < 2 || moves.length > 12) return 'Cần 2-12 lựa chọn.';
  if (new Set(moves).size !== moves.length) return 'Lựa chọn bị trùng.';
  for (const m of moves) if (!MOVE_RE.test(m)) return `Tên lựa chọn không hợp lệ: ${m} (chữ in hoa, số, _).`;
  if (!beats || typeof beats !== 'object') return 'Thiếu bảng thắng.';
  for (const [m, losers] of Object.entries(beats)) {
    if (!moves.includes(m)) return `Bảng thắng chứa lựa chọn lạ: ${m}`;
    if (!Array.isArray(losers)) return `beats.${m} phải là danh sách.`;
    for (const l of losers) {
      if (!moves.includes(l)) return `beats.${m} chứa lựa chọn lạ: ${l}`;
      if (l === m) return `${m} không thể thắng chính nó.`;
      if ((beats[l] || []).includes(m)) return `${m} và ${l} không thể thắng lẫn nhau.`;
    }
  }
  return null;
}

/** Phân xử một lượt. Lựa chọn null/không hợp lệ thua lựa chọn hợp lệ; cả hai không hợp lệ là hòa. */
function judge(rs, a, b) {
  const okA = rs.moves.includes(a);
  const okB = rs.moves.includes(b);
  if (!okA && !okB) return 'draw';
  if (!okA) return 'b';
  if (!okB) return 'a';
  if (a === b) return 'draw';
  if ((rs.beats[a] || []).includes(b)) return 'a';
  if ((rs.beats[b] || []).includes(a)) return 'b';
  return 'draw';
}

function tally(turns) {
  let a = 0, b = 0, d = 0;
  for (const t of turns) t.r === 'a' ? a++ : t.r === 'b' ? b++ : d++;
  return { winsA: a, winsB: b, draws: d };
}

/** Nhiều lượt thắng hơn thì thắng trận; bằng nhau là hòa. */
function matchResult({ winsA, winsB }) {
  return winsA > winsB ? 'a' : winsB > winsA ? 'b' : 'draw';
}

// Bộ sinh số ngẫu nhiên có seed: bốc thăm được ghi nhận và tái lập được.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newSeed() { return Math.floor(Math.random() * 2 ** 31); }

module.exports = { validateRuleset, judge, tally, matchResult, rng, shuffle, newSeed };
