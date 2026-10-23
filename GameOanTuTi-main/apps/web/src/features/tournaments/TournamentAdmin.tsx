import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Input,
  Select,
  Spinner,
  useToast,
} from '@arena/ui';
import type {
  ConfigurationAction,
  ConfigurationStatus,
  StageView,
  TournamentAuditEntry,
  TournamentView,
} from '@arena/contracts';
import { api, isApiError } from '../../lib/api';
import { useSession } from '../../lib/session';

export const CONFIG_LABEL: Record<ConfigurationStatus, string> = {
  draft: 'Nháp',
  open: 'Đang mở cấu hình',
  locked: 'Đã khóa cấu hình',
  confirmed: 'Đã chốt cấu hình',
};
const ACTION_LABEL: Record<ConfigurationAction, string> = {
  open: 'Mở cấu hình',
  lock: 'Khóa cấu hình',
  confirm: 'Chốt cấu hình',
  reopen: 'Mở lại cấu hình',
};
const ACTIONS: Record<ConfigurationStatus, ConfigurationAction[]> = {
  draft: ['open'],
  open: ['lock'],
  locked: ['confirm', 'reopen'],
  confirmed: ['reopen'],
};
function localTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const serverTime = (value: string) => (value ? new Date(value).toISOString() : null);

export function TournamentAdmin() {
  const { user } = useSession();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const q = useQuery({
    queryKey: ['admin-tournaments', user?.id],
    queryFn: () => api<TournamentView[]>('/admin/tournaments'),
  });
  const create = useMutation({
    mutationFn: () => api<TournamentView>('/admin/tournaments', { method: 'POST', json: { name } }),
    onSuccess: (t) => {
      setSelected(t.id);
      setName('');
      void qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
      toast({ title: 'Đã tạo giải nháp', tone: 'success' });
    },
  });
  const tournament = q.data?.find((t) => t.id === selected) ?? q.data?.[0];
  return (
    <section aria-label="Quản lý cấu hình giải" className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Cấu hình giải đấu"
          subtitle="Lập lịch → duyệt từng giai đoạn → duyệt giải → công bố"
        />
        <p className="mb-4 text-sm text-ink-muted">
          Chốt cấu hình xác nhận lịch và mốc khóa. Kết quả thi đấu và chuyển vòng được quản lý ở bước tiếp
          theo.
        </p>
        {user?.role === 'admin' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-48 flex-1">
              <Input
                label="Tên giải mới"
                required
                minLength={3}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" loading={create.isPending}>
              Tạo giải nháp
            </Button>
          </form>
        )}
        {create.error && (
          <Alert tone="error" title="Không tạo được giải">
            {create.error.message}
          </Alert>
        )}
      </Card>
      {q.isLoading && <Spinner label="Đang tải cấu hình giải" />}
      {q.error && (
        <Alert tone="error" title="Không tải được danh sách giải">
          {q.error.message}
        </Alert>
      )}
      {q.data?.length === 0 && <EmptyState title="Chưa có giải" />}
      {q.data && q.data.length > 0 && (
        <Select
          label="Giải cần quản lý"
          value={tournament?.id}
          onValueChange={setSelected}
          options={q.data.map((t) => ({
            value: t.id,
            label: `${t.name} · ${t.status === 'draft' ? 'Chưa công bố' : 'Đã công bố'}`,
          }))}
        />
      )}
      {tournament && (
        <TournamentEditor
          key={`${tournament.id}:${tournament.revision}`}
          tournament={tournament}
          readOnly={user?.role !== 'admin'}
          reason={reason}
          setReason={setReason}
        />
      )}
    </section>
  );
}

function TournamentEditor({
  tournament: t,
  readOnly,
  reason,
  setReason,
}: {
  tournament: TournamentView;
  readOnly: boolean;
  reason: string;
  setReason: (value: string) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [publish, setPublish] = useState(false);
  const [name, setName] = useState(t.name);
  const [description, setDescription] = useState(t.description);
  const [dates, setDates] = useState({
    registrationOpensAt: localTime(t.registrationOpensAt),
    registrationClosesAt: localTime(t.registrationClosesAt),
    teamLockAt: localTime(t.teamLockAt),
    botLockAt: localTime(t.botLockAt),
  });
  const history = useQuery({
    queryKey: ['tournament-audit', t.id, t.revision],
    queryFn: () => api<TournamentAuditEntry[]>(`/admin/tournaments/${t.id}/audit`),
  });
  const change = useMutation({
    mutationFn: ({
      path,
      method = 'POST',
      fields = {},
    }: {
      path: string;
      method?: string;
      fields?: Record<string, unknown>;
    }) =>
      api<TournamentView>(`/admin/tournaments/${t.id}${path}`, {
        method,
        json: { expectedRevision: t.revision, reason, ...fields },
      }),
    onSuccess: async () => {
      toast({ title: 'Đã lưu thay đổi cấu hình', tone: 'success' });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-tournaments'] }),
        qc.invalidateQueries({ queryKey: ['tournament'] }),
        qc.invalidateQueries({ queryKey: ['tournament-audit', t.id] }),
      ]);
    },
    onError: (e) => {
      if (isApiError(e, 'CONFLICT'))
        toast({ title: 'Thao tác bị chặn', description: e.message, tone: 'error' });
    },
  });
  const mutable = !readOnly && t.status === 'draft';
  const editable = mutable && ['draft', 'open'].includes(t.configStatus);
  const ready = reason.trim().length >= 3 && !change.isPending;
  const mutate = (path: string, fields?: Record<string, unknown>, method?: string) =>
    change.mutate({ path, fields, method });
  const dateLabels = {
    registrationOpensAt: 'Mở đăng ký',
    registrationClosesAt: 'Đóng đăng ký',
    teamLockAt: 'Khóa đội hình',
    botLockAt: 'Khóa nộp bot',
  };
  return (
    <>
      <Card>
        <CardHeader
          title={t.name}
          action={<Badge>{CONFIG_LABEL[t.configStatus]}</Badge>}
          subtitle={
            t.status === 'draft' ? 'Giải nháp · chưa hiển thị công khai' : 'Đã công bố · cấu hình đóng băng'
          }
        />
        {mutable && (
          <Input
            label="Lý do thao tác"
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint="Bắt buộc khi lưu, mở, khóa, chốt hoặc công bố; được lưu trong lịch sử."
          />
        )}
        {change.error && (
          <div className="mt-4">
            <Alert tone="error" title="Không thực hiện được thao tác">
              {change.error.message}
              {isApiError(change.error, 'CONFLICT') && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void qc.invalidateQueries({ queryKey: ['admin-tournaments'] })}
                >
                  Tải lại dữ liệu
                </Button>
              )}
            </Alert>
          </div>
        )}
      </Card>
      <Card>
        <section aria-label="Cấu hình giải">
          <CardHeader
            title="Thông tin và lịch đăng ký"
            subtitle={`Giờ nhập theo múi giờ thiết bị: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
          />
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              mutate(
                '',
                {
                  name,
                  description,
                  ...Object.fromEntries(
                    Object.entries(dates).map(([key, value]) => [key, serverTime(value)]),
                  ),
                },
                'PATCH',
              );
            }}
            className="flex flex-col gap-4"
          >
            <Input
              label="Tên giải"
              required
              minLength={3}
              maxLength={120}
              value={name}
              disabled={!editable}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Mô tả giải"
              maxLength={2000}
              value={description}
              disabled={!editable}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="grid gap-4 md:grid-cols-2">
              {(Object.keys(dateLabels) as (keyof typeof dates)[]).map((key) => (
                <Input
                  key={key}
                  type="datetime-local"
                  label={dateLabels[key]}
                  value={dates[key]}
                  disabled={!editable}
                  onChange={(e) => setDates({ ...dates, [key]: e.target.value })}
                />
              ))}
            </div>
            {editable && (
              <Button type="submit" disabled={!ready} loading={change.isPending}>
                Lưu cấu hình giải
              </Button>
            )}
          </form>
          {mutable && (
            <div className="mt-4 flex flex-wrap gap-3">
              {ACTIONS[t.configStatus].map((action) => (
                <Button
                  key={action}
                  variant="secondary"
                  disabled={!ready}
                  onClick={() => mutate('/configuration', { action })}
                >
                  {ACTION_LABEL[action]}
                </Button>
              ))}
              {t.configStatus === 'confirmed' && (
                <Button disabled={!ready} onClick={() => setPublish(true)}>
                  Công bố giải
                </Button>
              )}
            </div>
          )}
        </section>
      </Card>
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Lịch các giai đoạn</h2>
        {t.stages.map((stage) => (
          <StageEditor
            key={stage.id}
            stage={stage}
            mutable={mutable && ['draft', 'open'].includes(t.configStatus)}
            ready={ready}
            save={(fields) => mutate(`/stages/${stage.id}`, fields, 'PATCH')}
            transition={(action) => mutate(`/stages/${stage.id}/configuration`, { action })}
          />
        ))}
        {editable && (
          <StageEditor key="new" ready={ready} mutable save={(fields) => mutate('/stages', fields)} />
        )}
      </div>
      <Card>
        <CardHeader title="Lịch sử thao tác" subtitle="Tối đa 100 thao tác gần nhất; thời gian từ máy chủ." />
        {history.error && (
          <Alert tone="error" title="Không tải được lịch sử">
            {history.error.message}
          </Alert>
        )}
        {history.isLoading && <Spinner label="Đang tải lịch sử" />}
        <ol className="space-y-3 text-sm">
          {history.data?.map((entry) => (
            <li key={entry.id} className="break-words border-b border-line pb-3">
              <p className="font-semibold">{entry.action}</p>
              <p className="text-ink-muted">
                {new Date(entry.createdAt).toLocaleString('vi-VN')} · {entry.actorId ?? 'Hệ thống'}
                {entry.reason ? ` · ${entry.reason}` : ''}
              </p>
            </li>
          ))}
        </ol>
      </Card>
      <Dialog
        open={publish}
        onOpenChange={setPublish}
        title="Công bố lịch giải?"
        description="Lịch và cấu hình sẽ đóng băng sau khi công bố. Giải mới sẽ trở thành giải hiện tại khi có thời điểm tạo mới nhất trong các giải đang công bố."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPublish(false)}>
              Hủy
            </Button>
            <Button
              disabled={!ready}
              onClick={() => {
                setPublish(false);
                mutate('/publish');
              }}
            >
              Xác nhận công bố
            </Button>
          </>
        }
      />
    </>
  );
}

function StageEditor({
  stage,
  mutable,
  ready,
  save,
  transition,
}: {
  stage?: StageView;
  mutable: boolean;
  ready: boolean;
  save: (fields: Record<string, unknown>) => void;
  transition?: (action: ConfigurationAction) => void;
}) {
  const [name, setName] = useState(stage?.name ?? '');
  const [kind, setKind] = useState(stage?.kind ?? 'qualifier');
  const [dates, setDates] = useState({
    lockAt: localTime(stage?.lockAt ?? null),
    startsAt: localTime(stage?.startsAt ?? null),
    endsAt: localTime(stage?.endsAt ?? null),
  });
  const editable = mutable && (!stage || ['draft', 'open'].includes(stage.configStatus));
  return (
    <Card>
      <section aria-label={stage ? `Giai đoạn ${stage.ord}` : 'Thêm giai đoạn'}>
        <CardHeader
          title={stage ? `${stage.ord}. ${stage.name}` : 'Thêm giai đoạn'}
          action={stage ? <Badge>{CONFIG_LABEL[stage.configStatus]}</Badge> : undefined}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save({
              name,
              kind,
              ...Object.fromEntries(Object.entries(dates).map(([key, value]) => [key, serverTime(value)])),
            });
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Tên giai đoạn"
              required
              minLength={3}
              maxLength={120}
              value={name}
              disabled={!editable}
              onChange={(e) => setName(e.target.value)}
            />
            <Select
              label="Loại giai đoạn"
              value={kind}
              disabled={!editable}
              onValueChange={(value) => setKind(value as StageView['kind'])}
              options={[
                { value: 'qualifier', label: 'Sơ loại' },
                { value: 'knockout', label: 'Loại trực tiếp 32 → 4' },
              ]}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(['lockAt', 'startsAt', 'endsAt'] as const).map((key) => (
              <Input
                key={key}
                label={
                  {
                    lockAt: 'Hạn khóa giai đoạn',
                    startsAt: 'Bắt đầu giai đoạn',
                    endsAt: 'Kết thúc giai đoạn',
                  }[key]
                }
                type="datetime-local"
                value={dates[key]}
                disabled={!editable}
                onChange={(e) => setDates({ ...dates, [key]: e.target.value })}
              />
            ))}
          </div>
          {editable && (
            <Button type="submit" variant="secondary" disabled={!ready}>
              {stage ? 'Lưu giai đoạn' : 'Thêm giai đoạn'}
            </Button>
          )}
        </form>
        {stage && mutable && transition && (
          <div className="mt-4 flex flex-wrap gap-3">
            {ACTIONS[stage.configStatus].map((action) => (
              <Button key={action} disabled={!ready} variant="secondary" onClick={() => transition(action)}>
                {ACTION_LABEL[action]}
              </Button>
            ))}
          </div>
        )}
      </section>
    </Card>
  );
}
