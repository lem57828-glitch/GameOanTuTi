// Lập kế hoạch các mức sơ loại: BTC chọn SỐ MỨC, rồi nhập số đội giữ lại và số vòng Swiss cho từng mức.
// Mức cuối luôn giữ 32 đội (vào cây loại trực tiếp). Kiểm tra ngay khi nhập; máy chủ vẫn kiểm tra lại khi lưu.
import { useState, type ReactNode } from 'react';
import { Button, Input, Select, cn } from '@arena/ui';
import type { LevelView } from '@arena/contracts';

export const FINAL_TARGET = 32;
const MAX_LEVELS = 8;

export interface PlanRow {
  name: string;
  target: string;
  rounds: string;
}

/** Giá trị gợi ý cho k mức: 500 → 200 → 100 → 32 lấy từ cuối; nhiều hơn 4 mức thì chia đều theo cấp số nhân. */
export function defaultTargets(k: number, teams: number): number[] {
  const base = [500, 200, 100];
  if (k <= base.length + 1) return [...base.slice(base.length - (k - 1)), FINAL_TARGET];
  const top = Math.max(teams, 1000);
  const out: number[] = [];
  for (let i = 1; i < k; i++) {
    const v = Math.round((top * Math.pow(FINAL_TARGET / top, i / k)) / 10) * 10;
    out.push(Math.max(v, FINAL_TARGET + (k - i)));
  }
  return [...out, FINAL_TARGET];
}

export interface PlanCheck {
  rows: Array<{ target?: string; rounds?: string; warning?: string }>;
  valid: boolean;
}

/** Kiểm tra kế hoạch: số nguyên, giảm dần, mức cuối = 32, số vòng 1–20; cảnh báo mức sẽ bị bỏ qua. */
export function checkPlan(rows: PlanRow[], teams: number): PlanCheck {
  let entering = teams;
  const out = rows.map((r, i) => {
    const e: { target?: string; rounds?: string; warning?: string } = {};
    const t = Number(r.target);
    const rd = Number(r.rounds);
    const isLast = i === rows.length - 1;
    if (!/^\d+$/.test(r.target) || t < 2) e.target = 'Nhập số nguyên ≥ 2.';
    else if (isLast && t !== FINAL_TARGET) e.target = `Mức cuối phải giữ ${FINAL_TARGET} đội.`;
    else if (i > 0 && t >= Number(rows[i - 1]!.target)) e.target = `Phải nhỏ hơn mức trước (${rows[i - 1]!.target}).`;
    if (!/^\d+$/.test(r.rounds) || rd < 1 || rd > 20) e.rounds = '1–20 vòng.';
    if (!e.target && !isLast && entering > 0 && t >= entering)
      e.warning = `Chỉ khoảng ${entering} đội vào mức này nên mức sẽ được bỏ qua khi khóa.`;
    if (!e.target) entering = Math.min(entering, t);
    return e;
  });
  return { rows: out, valid: rows.length > 0 && out.every((x) => !x.target && !x.rounds) };
}

export function PlanEditor({
  levels,
  suggested,
  eligibleTeams,
  busy,
  extra,
  onSubmit,
}: {
  levels: LevelView[];
  /** Gợi ý của máy chủ theo số đội (vd. 500 → 200 → 100 → 32, bỏ các mức không nhỏ hơn số đội). */
  suggested: number[];
  eligibleTeams: number;
  busy: boolean;
  /** Ô cấu hình chung đặt cạnh "Số mức" (vd. phạm vi tránh tái đấu). */
  extra?: ReactNode;
  onSubmit: (plan: { targets: number[]; rounds: number[]; names: string[] }) => void;
}) {
  // Điền sẵn: kế hoạch hiện tại nếu có, không thì gợi ý của máy chủ.
  const [rows, setRows] = useState<PlanRow[]>(() =>
    levels.length
      ? levels.map((l) => ({ name: l.name, target: String(l.teamTarget), rounds: String(l.rounds) }))
      : suggested.map((t, i) => ({ name: `Mức ${i + 1}`, target: String(t), rounds: '3' })),
  );
  const check = checkPlan(rows, eligibleTeams);

  // Đổi số mức: giữ các mức đầu đã nhập (trừ mức cuối cũ), mức mới lấy theo gợi ý; mức cuối luôn 32.
  const setCount = (k: number) => {
    const targets = k === suggested.length ? suggested : defaultTargets(k, eligibleTeams);
    setRows((old) =>
      Array.from({ length: k }, (_, i) => {
        const keep = old[i] && i < k - 1 && i < old.length - 1 ? old[i]! : null;
        return {
          name: keep?.name ?? old[i]?.name ?? `Mức ${i + 1}`,
          target: keep ? keep.target : String(targets[i]),
          rounds: old[i]?.rounds ?? old.at(-1)?.rounds ?? '3',
        };
      }),
    );
  };
  const update = (i: number, patch: Partial<PlanRow>) => setRows((old) => old.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[180px_220px_1fr] sm:items-end">
        <Select
          label="Số mức sơ loại"
          value={String(rows.length)}
          onValueChange={(v) => setCount(Number(v))}
          options={Array.from({ length: MAX_LEVELS }, (_, i) => ({ value: String(i + 1), label: `${i + 1} mức` }))}
        />
        {extra ?? <span />}
        <p className="text-sm text-ink-muted" aria-live="polite">
          {eligibleTeams} đội → {rows.map((r) => r.target || '?').join(' → ')}
        </p>
      </div>
      <ol className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const e = check.rows[i]!;
          const isLast = i === rows.length - 1;
          return (
            <li key={i} className={cn('grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_160px_140px]', e.target || e.rounds ? 'border-danger/60' : 'border-line')}>
              <Input label={`Tên mức ${i + 1}`} maxLength={60} value={r.name} onChange={(ev) => update(i, { name: ev.target.value })} />
              <Input
                label="Số đội giữ lại"
                type="number"
                inputMode="numeric"
                min={2}
                value={r.target}
                disabled={isLast}
                onChange={(ev) => update(i, { target: ev.target.value.replace(/\D/g, '') })}
                error={e.target}
                hint={isLast ? 'Mức cuối: 32 đội vào loại trực tiếp.' : undefined}
              />
              <Input
                label="Số vòng Swiss"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={r.rounds}
                onChange={(ev) => update(i, { rounds: ev.target.value.replace(/\D/g, '') })}
                error={e.rounds}
                hint={!e.rounds ? 'Đề xuất 3–5.' : undefined}
              />
              {e.warning && <p className="text-xs text-warning sm:col-span-3">{e.warning}</p>}
            </li>
          );
        })}
      </ol>
      <div>
        <Button
          loading={busy}
          disabled={!check.valid}
          onClick={() =>
            onSubmit({
              targets: rows.map((r) => Number(r.target)),
              rounds: rows.map((r) => Number(r.rounds)),
              names: rows.map((r, i) => r.name.trim() || `Mức ${i + 1}`),
            })
          }
        >
          {levels.length ? 'Thay kế hoạch' : 'Lưu kế hoạch'}
        </Button>
        {!check.valid && <p className="mt-2 text-xs text-danger">Sửa các ô báo đỏ trước khi lưu.</p>}
        {levels.length > 0 && (
          <p className="mt-2 text-xs text-ink-muted">
            Thay kế hoạch xóa các mức cũ (kể cả mốc khóa bot/công bố đã đặt) và tạo mức mới; đội và bot giữ nguyên.
          </p>
        )}
      </div>
    </div>
  );
}
