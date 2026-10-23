import { TEAM_MEMBER_LIMIT } from '@arena/contracts';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, EmptyState, Input, Spinner } from '@arena/ui';
import type { AdminAccountView, AdminTeamView, PublicationView } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { ActionButton, ActionForm, ErrorMessage } from './Forms';

const roles = [
  { value: 'student', label: 'Thí sinh' },
  { value: 'referee', label: 'Trọng tài' },
  { value: 'admin', label: 'Quản trị viên' },
];
const statuses = [
  { value: 'draft', label: 'Đang lập' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'locked', label: 'Đã khóa' },
];
export function Tv1Admin() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState('accounts');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string>();
  const [editing, setEditing] = useState<PublicationView | null>(null);
  const [publicationForm, setPublicationForm] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const recipients = useQuery({
    queryKey: ['tv1-admin', 'recipients', recipientSearch],
    queryFn: () =>
      api<{ items: AdminAccountView[] }>(`/admin/accounts?search=${encodeURIComponent(recipientSearch)}`),
    enabled: user?.role === 'admin' && tab === 'notifications',
  });
  const accounts = useQuery({
    queryKey: ['tv1-admin', 'accounts', search, page],
    queryFn: () =>
      api<{ items: AdminAccountView[]; total: number }>(
        `/admin/accounts?search=${encodeURIComponent(search)}&page=${page}`,
      ),
    enabled: user?.role === 'admin' && tab === 'accounts',
  });
  const teams = useQuery({
    queryKey: ['tv1-admin', 'teams'],
    queryFn: () => api<AdminTeamView[]>('/admin/teams'),
    enabled: user?.role === 'admin' && tab === 'teams',
  });
  const publications = useQuery({
    queryKey: ['tv1-admin', 'publications'],
    queryFn: () => api<PublicationView[]>('/admin/publications'),
    enabled: user?.role === 'admin' && tab === 'publications',
  });
  const mail = useQuery({
    queryKey: ['tv1-admin', 'mail'],
    queryFn: () =>
      api<{
        transport: string;
        items: {
          id: string;
          to: string;
          subject: string;
          status: string;
          attempts: number;
          lastError: string | null;
        }[];
      }>('/admin/mail-status'),
    enabled: user?.role === 'admin' && tab === 'mail',
    refetchInterval: 10000,
  });
  const audit = useQuery({
    queryKey: ['tv1-admin', 'audit'],
    queryFn: () =>
      api<
        {
          id: string;
          actorId: string | null;
          action: string;
          target: string | null;
          reason: string | null;
          createdAt: string;
        }[]
      >('/admin/tv1/audit'),
    enabled: user?.role === 'admin' && tab === 'audit',
  });
  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['tv1-admin'] });
    await qc.invalidateQueries({ queryKey: ['publications'] });
    await qc.invalidateQueries({ queryKey: ['notifications'] });
  }
  if (user?.role !== 'admin') return <Alert tone="error" title="Chỉ quản trị viên được truy cập" />;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black">Quản trị tài khoản và nội dung</h1>
      <div className="flex flex-wrap gap-2">
        {[
          ['accounts', 'Tài khoản'],
          ['teams', 'Đội'],
          ['publications', 'Nội dung BTC'],
          ['notifications', 'Gửi thông báo'],
          ['mail', 'Email'],
          ['audit', 'Lịch sử'],
        ].map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={tab === id ? 'primary' : 'secondary'}
            onClick={() => {
              setTab(id!);
              setSelected(undefined);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === 'accounts' && (
        <>
          <Input
            label="Tìm tài khoản theo tên, email, MSSV"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <ErrorMessage error={accounts.error} />
          {accounts.isLoading && <Spinner />}
          {accounts.data?.items.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold">{a.fullName}</h2>
                  <p className="break-all text-sm text-ink-muted">
                    {a.email} · {a.studentId || 'Chưa có MSSV'}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {a.className} · {a.faculty}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{roles.find((r) => r.value === a.role)?.label}</Badge>
                  <Badge tone={a.status === 'active' ? 'success' : 'danger'}>
                    {a.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                  </Badge>
                  <Badge tone={a.emailVerified ? 'success' : 'warning'}>
                    {a.emailVerified ? 'Đã xác minh' : 'Chưa xác minh'}
                  </Badge>
                  {!a.isDemo && a.id !== user.id && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelected(selected === a.id ? undefined : a.id)}
                    >
                      Quyền và trạng thái
                    </Button>
                  )}
                </div>
              </div>
              {selected === a.id && (
                <div className="mt-5">
                  <ActionForm
                    key={a.id + a.role + a.status}
                    fields={[
                      { name: 'role', label: 'Vai trò', value: a.role, options: roles },
                      {
                        name: 'status',
                        label: 'Trạng thái',
                        value: a.status,
                        options: [
                          { value: 'active', label: 'Hoạt động' },
                          { value: 'disabled', label: 'Khóa tài khoản' },
                        ],
                      },
                      { name: 'reason', label: 'Lý do thay đổi', minLength: 5, maxLength: 500 },
                    ]}
                    submit="Lưu thay đổi"
                    onSubmit={(values) => api(`/admin/accounts/${a.id}`, { method: 'PATCH', json: values })}
                    onDone={refresh}
                    success="Đã cập nhật"
                  />
                </div>
              )}
            </Card>
          ))}
          <div className="flex items-center gap-3">
            <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Trang trước
            </Button>
            <span>{page}</span>
            <Button
              variant="secondary"
              disabled={!accounts.data || page * 25 >= accounts.data.total}
              onClick={() => setPage(page + 1)}
            >
              Trang sau
            </Button>
          </div>
        </>
      )}
      {tab === 'teams' && (
        <>
          <ErrorMessage error={teams.error} />
          {teams.isLoading && <Spinner />}
          {teams.data?.map((t) => (
            <Card key={t.id}>
              <h2 className="text-lg font-bold">{t.name}</h2>
              <p className="my-2 text-sm text-ink-muted">
                {t.members.length}/{TEAM_MEMBER_LIMIT} thành viên · {t.status}
              </p>
              <ul className="mb-4 text-sm">
                {t.members.map((m) => (
                  <li key={m.accountId}>
                    {m.displayName}
                    {m.accountId === t.captainId ? ' · Đội trưởng' : ''}
                  </li>
                ))}
              </ul>
              {t.status !== 'withdrawn' && (
                <ActionForm
                  fields={[
                    { name: 'status', label: 'Trạng thái đội', value: t.status, options: statuses },
                    { name: 'reason', label: 'Lý do duyệt, khóa hoặc mở lại', minLength: 5, maxLength: 500 },
                  ]}
                  submit="Cập nhật đội"
                  onSubmit={(values) => api(`/admin/teams/${t.id}`, { method: 'PATCH', json: values })}
                  onDone={refresh}
                  success="Đã cập nhật đội"
                />
              )}
            </Card>
          ))}
        </>
      )}
      {tab === 'publications' && (
        <>
          <Button
            onClick={() => {
              setEditing(null);
              setPublicationForm(true);
            }}
          >
            Thêm nội dung
          </Button>
          <ErrorMessage error={publications.error} />
          {publicationForm && (
            <Card>
              <h2 className="mb-4 text-xl font-bold">{editing ? 'Sửa nội dung' : 'Nội dung mới'}</h2>
              <ActionForm
                key={editing?.id ?? 'new'}
                fields={[
                  { name: 'title', label: 'Tiêu đề', value: editing?.title, maxLength: 200 },
                  {
                    name: 'kind',
                    label: 'Loại nội dung',
                    value: editing?.kind ?? 'announcement',
                    options: [
                      { value: 'announcement', label: 'Thông báo' },
                      { value: 'guide', label: 'Hướng dẫn' },
                      { value: 'document', label: 'Tài liệu' },
                    ],
                  },
                  { name: 'body', label: 'Nội dung', value: editing?.body, multiline: true, maxLength: 8000 },
                  {
                    name: 'linkUrl',
                    label: 'Liên kết tài liệu (tùy chọn)',
                    value: editing?.linkUrl ?? '',
                    type: 'url',
                    required: false,
                    maxLength: 2000,
                  },
                  {
                    name: 'published',
                    label: 'Hiển thị',
                    value: editing?.published ? 'true' : 'false',
                    options: [
                      { value: 'false', label: 'Lưu nháp' },
                      { value: 'true', label: 'Công bố và gửi thông báo' },
                    ],
                  },
                ]}
                submit="Lưu nội dung"
                onSubmit={(values) =>
                  api(editing ? `/admin/publications/${editing.id}` : '/admin/publications', {
                    method: editing ? 'PATCH' : 'POST',
                    json: {
                      ...values,
                      published: values.published === 'true',
                      ...(editing ? { expectedRevision: editing.revision } : {}),
                    },
                  })
                }
                onDone={async () => {
                  await refresh();
                  setPublicationForm(false);
                }}
              />
              <Button className="mt-3" variant="secondary" onClick={() => setPublicationForm(false)}>
                Đóng
              </Button>
            </Card>
          )}
          {publications.data?.map((p) => (
            <Card key={p.id}>
              <Badge tone={p.published ? 'success' : 'neutral'}>
                {p.published ? 'Đã công bố' : 'Bản nháp'}
              </Badge>
              <h2 className="my-3 text-xl font-bold">{p.title}</h2>
              <p className="mb-4 whitespace-pre-wrap text-sm text-ink-muted">{p.body.slice(0, 300)}</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(p);
                    setPublicationForm(true);
                  }}
                >
                  Sửa nội dung
                </Button>
                <ActionButton
                  confirm="Xóa nội dung này?"
                  run={() => api(`/admin/publications/${p.id}`, { method: 'DELETE' })}
                  onDone={refresh}
                >
                  Xóa nội dung
                </ActionButton>
              </div>
            </Card>
          ))}
        </>
      )}
      {tab === 'notifications' && (
        <Card>
          <h2 className="mb-4 text-xl font-bold">Thông báo lịch, hiệp và kết quả</h2>
          <p className="mb-5 text-sm text-ink-muted">
            Lịch giải và kết quả hiệp hiện có được đồng bộ tự động. Biểu mẫu này dành cho thông báo bổ sung
            của BTC. Chọn người nhận rồi nhập nội dung cần gửi.
          </p>
          <div className="mb-6 flex flex-col gap-3">
            <Input
              label="Tìm người nhận theo tên, MSSV hoặc email"
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
            />
            <ErrorMessage error={recipients.error} />
            <p className="text-sm text-ink-muted">Đã chọn {recipientIds.length} người nhận</p>
            <div className="max-h-64 overflow-auto rounded-md border border-line">
              {recipients.data?.items
                .filter((a) => a.status === 'active')
                .map((a) => (
                  <label key={a.id} className="flex items-start gap-3 border-b border-line p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={recipientIds.includes(a.id)}
                      onChange={(e) =>
                        setRecipientIds((ids) =>
                          e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id),
                        )
                      }
                    />
                    <span className="break-all">
                      {a.fullName}
                      <span className="block text-xs text-ink-muted">{a.email}</span>
                    </span>
                  </label>
                ))}
            </div>
          </div>
          <ActionForm
            fields={[
              {
                name: 'kind',
                label: 'Loại thông báo',
                value: 'schedule',
                options: [
                  { value: 'schedule', label: 'Lịch giải' },
                  { value: 'round', label: 'Hiệp đấu' },
                  { value: 'result', label: 'Kết quả' },
                ],
              },
              { name: 'title', label: 'Tiêu đề', maxLength: 200 },
              { name: 'body', label: 'Nội dung', multiline: true, maxLength: 2000 },
              {
                name: 'href',
                label: 'Trang chi tiết',
                value: '/tournament',
                options: [
                  { value: '/tournament', label: 'Giải đấu' },
                  { value: '/rooms', label: 'Phòng đấu' },
                  { value: '/news', label: 'Thông báo BTC' },
                  { value: '/team', label: 'Đội của tôi' },
                ],
              },
            ]}
            submit="Gửi thông báo"
            disabled={recipientIds.length === 0}
            onSubmit={(values) =>
              api('/admin/notification-events', {
                method: 'POST',
                json: {
                  ...values,
                  sourceKey: crypto.randomUUID(),
                  accountIds: recipientIds,
                },
              })
            }
            onDone={refresh}
            success="Đã ghi nhận thông báo"
          />
        </Card>
      )}
      {tab === 'mail' && (
        <>
          <ErrorMessage error={mail.error} />
          <Alert
            title={
              mail.data?.transport === 'smtp' ? 'Gửi email qua SMTP' : 'Hộp thư thử nghiệm đang hoạt động'
            }
          >
            Email lỗi được thử lại tự động tối đa 5 lần. Quản trị viên có thể xếp hàng gửi lại sau khi sửa cấu
            hình.
          </Alert>
          {mail.data?.items.map((m) => (
            <Card key={m.id}>
              <h2 className="font-bold">{m.subject}</h2>
              <p className="my-2 break-all text-sm text-ink-muted">
                {m.to} · {m.status} · {m.attempts} lần thử
              </p>
              {m.lastError && <p className="mb-3 text-sm text-danger">{m.lastError}</p>}
              {m.status === 'failed' && (
                <ActionButton
                  run={() => api(`/admin/mail-status/${m.id}/retry`, { method: 'POST' })}
                  onDone={refresh}
                >
                  Gửi lại
                </ActionButton>
              )}
            </Card>
          ))}
        </>
      )}
      {tab === 'audit' && (
        <>
          <ErrorMessage error={audit.error} />
          {audit.data?.length === 0 && <EmptyState title="Chưa có lịch sử" />}
          {audit.data?.map((a) => (
            <Card key={a.id}>
              <h2 className="font-semibold">{a.action}</h2>
              <p className="mt-2 break-all text-xs text-ink-muted">
                {new Date(a.createdAt).toLocaleString('vi-VN')} · Người thực hiện: {a.actorId} · Đối tượng:{' '}
                {a.target}
              </p>
              {a.reason && <p className="mt-2 text-sm">{a.reason}</p>}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
