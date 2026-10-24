// Bot của tôi. TV2 — Gói việc 1: Nộp bot, quản lý phiên bản, kiểm tra tính hợp lệ & xem mã nguồn.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { Alert, Badge, Button, Card, CardHeader, Dialog, EmptyState, Input, Spinner, Table } from '@arena/ui';
import type { BotSourceDetail, BotVersion, PieceType, TestRunDetail } from '@arena/contracts';
import { SubmitBotInput } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { TestRunReplay } from './TestRunReplay';

const STATUS: Record<BotVersion['status'], { label: string; tone: 'neutral' | 'success' | 'danger' }> = {
  pending: { label: 'Chờ kiểm thử', tone: 'neutral' },
  valid: { label: 'Hợp lệ', tone: 'success' },
  invalid: { label: 'Không hợp lệ', tone: 'danger' },
};

export function MyBotsPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['bots', user?.id],
    queryFn: () => api<BotVersion[]>('/bots'),
    refetchInterval: (query) => (query.state.data?.some((bot) => bot.status === 'pending') ? 1000 : false),
  });

  // State cho xem chi tiết & mã nguồn
  const [selectedBot, setSelectedBot] = useState<BotVersion | null>(null);
  const sourceQuery = useQuery({
    queryKey: ['bot-source', selectedBot?.id],
    queryFn: () => api<BotSourceDetail>(`/bots/${selectedBot!.id}/source`),
    enabled: !!selectedBot,
  });

  // Xóa phiên bản không dùng nữa: hỏi xác nhận; máy chủ từ chối nếu bot đã vào bộ bot/thi đấu chính thức.
  const [deleteBot, setDeleteBot] = useState<BotVersion | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (botId: string) =>
      api<{ id: string; testRuns: number }>(`/bots/${botId}`, { method: 'DELETE' }),
    onSuccess: (_, botId) => {
      setDeleteBot(null);
      if (selectedBot?.id === botId) setSelectedBot(null);
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
    },
  });

  // State cho Đấu thử (TV2 - Gói việc 4)
  const [testRunBot, setTestRunBot] = useState<BotVersion | null>(null);
  const [opponentPolicy, setOpponentPolicy] = useState('greedy');
  const [opponentType, setOpponentType] = useState<'demo' | 'bot'>('demo');
  const [opponentBotId, setOpponentBotId] = useState('');
  const ownOpponents = (q.data ?? []).filter(
    (bot) => bot.teamId === testRunBot?.teamId && bot.status === 'valid',
  );
  const [extraType, setExtraType] = useState<PieceType>('PAPER');
  const [activeTestRunId, setActiveTestRunId] = useState<string | null>(null);

  const testRunQuery = useQuery({
    queryKey: ['test-run', activeTestRunId],
    queryFn: () => api<TestRunDetail>(`/test-runs/${activeTestRunId}`),
    enabled: !!activeTestRunId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'succeeded' || status === 'failed' ? false : 1000;
    },
  });

  const startTestRunMutation = useMutation({
    mutationFn: (botId: string) =>
      api<TestRunDetail>(`/bots/${botId}/test-runs`, {
        method: 'POST',
        json: {
          botVersionId: botId,
          opponentType,
          opponentTarget: opponentType === 'bot' ? opponentBotId : opponentPolicy,
          mySide: 'blue',
          extraType,
        },
      }),
    onSuccess: (data) => {
      setActiveTestRunId(data.id);
    },
  });

  // State cho nộp bot mới
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitTeamId, setSubmitTeamId] = useState('');
  const [label, setLabel] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [submitMode, setSubmitMode] = useState<'direct' | 'github'>('direct');
  const [githubRepo, setGithubRepo] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [sourcePath, setSourcePath] = useState('bot.py');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const staff = user?.role === 'admin';

  const submitMutation = useMutation({
    mutationFn: (data: SubmitBotInput) =>
      api<BotVersion>('/bots', {
        method: 'POST',
        json: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
      setSubmitOpen(false);
      setLabel('');
      setSourceCode('');
      setGithubRepo('');
      setCommitSha('');
      setSubmitError(null);
    },
    onError: (err: Error) => {
      setSubmitError(err?.message || 'Không thể nộp bot.');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setSourceCode(content);
      if (!label) {
        setLabel(file.name.replace(/\.py$/, ''));
      }
    };
    reader.readAsText(file);
  };

  /** "Sửa" bot: phiên bản bất biến nên mở form nộp phiên bản MỚI, điền sẵn mã của phiên bản đang xem. */
  const handleEditAsNew = () => {
    if (!selectedBot || !sourceQuery.data) return;
    setSubmitTeamId(selectedBot.teamId);
    setLabel(`${selectedBot.label} (sửa từ v${selectedBot.version})`);
    setSourceCode(sourceQuery.data.sourceCode);
    setSubmitMode('direct');
    setSelectedBot(null);
    setSubmitError(null);
    setSubmitOpen(true);
  };

  const handleOpenSubmit = () => {
    if (!user?.teamId && !staff) {
      alert('Bạn cần tham gia hoặc tạo một đội để có thể nộp bot.');
      return;
    }
    setSubmitError(null);
    setSubmitOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Bot & runner (TV2)</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">
            {staff ? 'Tất cả phiên bản bot' : 'Bot của tôi'}
          </h1>
        </div>
        <Button onClick={handleOpenSubmit}>+ Nộp phiên bản mới</Button>
      </header>

      {q.isLoading && <Spinner label="Đang tải bot" />}
      {q.error && (
        <Alert tone="error" title="Không tải được danh sách bot">
          {(q.error as Error).message}
        </Alert>
      )}

      {q.data && (
        <Card>
          <CardHeader
            title="Phiên bản đã nộp"
            subtitle="Mỗi phiên bản là bất biến: muốn sửa, nộp phiên bản mới."
          />
          <Table
            label="Danh sách phiên bản bot"
            rows={q.data}
            rowKey={(b) => b.id}
            empty={
              <EmptyState
                title="Chưa có phiên bản bot nào"
                description={
                  user?.teamId
                    ? 'Đội của bạn chưa có bot. Hãy nộp phiên bản đầu tiên!'
                    : 'Bạn cần thuộc một đội để có bot.'
                }
              />
            }
            columns={[
              {
                key: 'v',
                header: 'Phiên bản',
                cell: (b) => <span className="font-mono font-bold text-accent">v{b.version}</span>,
              },
              { key: 'label', header: 'Nhãn mô tả', cell: (b) => b.label },
              {
                key: 'submission',
                header: 'Nguồn nộp',
                cell: (b) => (
                  <span className="text-xs text-ink-muted">
                    {b.submissionMethod === 'github'
                      ? 'GitHub · thi chính thức'
                      : b.submissionMethod === 'demo'
                        ? 'Bot mẫu'
                        : 'Trực tiếp · tập luyện'}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Kiểm tra',
                cell: (b) => (
                  <Badge tone={STATUS[b.status].tone} dot>
                    {STATUS[b.status].label}
                  </Badge>
                ),
              },
              {
                key: 'dup',
                header: 'Trùng lặp',
                cell: (b) =>
                  b.duplicateOfId ? (
                    <Badge tone="warning">Phát hiện trùng</Badge>
                  ) : (
                    <span className="text-xs text-ink-muted">—</span>
                  ),
              },
              {
                key: 'act',
                header: <span className="sr-only">Thao tác</span>,
                cell: (b) => (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        startTestRunMutation.reset();
                        setTestRunBot(b);
                        setActiveTestRunId(null);
                      }}
                      disabled={b.status !== 'valid'}
                      title={
                        b.status !== 'valid' ? 'Bot phải hợp lệ trước khi đấu thử' : 'Mở cấu hình đấu thử'
                      }
                    >
                      Đấu thử
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedBot(b)}
                      aria-label={`Xem chi tiết v${b.version}`}
                    >
                      Chi tiết & Code
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        deleteMutation.reset();
                        setDeleteBot(b);
                      }}
                      aria-label={`Xóa v${b.version}`}
                    >
                      Xóa
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* Dialog xem chi tiết và mã nguồn */}
      <Dialog
        open={!!selectedBot}
        onOpenChange={(o) => !o && setSelectedBot(null)}
        title={selectedBot ? `Phiên bản v${selectedBot.version} — ${selectedBot.label}` : ''}
        description="Mã nguồn bất biến được lưu trữ an toàn trong cơ sở dữ liệu."
      >
        {selectedBot && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-muted">Trạng thái:</dt>
              <dd>
                <Badge tone={STATUS[selectedBot.status].tone} dot>
                  {STATUS[selectedBot.status].label}
                </Badge>
              </dd>
              <dt className="text-ink-muted">Tạo lúc:</dt>
              <dd>{new Date(selectedBot.createdAt).toLocaleString('vi-VN')}</dd>
            </dl>

            {sourceQuery.isLoading && <Spinner label="Đang tải mã nguồn..." />}
            {sourceQuery.error && (
              <Alert tone="error" title="Không tải được mã nguồn">
                {(sourceQuery.error as Error).message}
              </Alert>
            )}

            {sourceQuery.data && (
              <>
                {sourceQuery.data.githubRepo && (
                  <div className="break-all rounded border border-line bg-surface-2 p-3 text-xs">
                    <p>Repository: {sourceQuery.data.githubRepo}</p>
                    <p>Commit: {sourceQuery.data.commitSha}</p>
                    <p>File: {sourceQuery.data.sourcePath}</p>
                    <p>SHA-256 snapshot: {sourceQuery.data.sourceHash}</p>
                    <p className="mt-2 text-ink-muted">
                      Chỉ bot GitHub hợp lệ và thuộc bộ đã khóa mới được thi chính thức.
                    </p>
                  </div>
                )}
                {sourceQuery.data.validationLog && (
                  <div className="rounded border border-line bg-surface-2 p-3 text-xs">
                    <span className="font-semibold text-ink">Nhật ký kiểm tra:</span>
                    <pre className="mt-1 whitespace-pre-wrap text-ink-muted">
                      {sourceQuery.data.validationLog}
                    </pre>
                  </div>
                )}

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-muted">Mã nguồn Python:</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void navigator.clipboard.writeText(sourceQuery.data!.sourceCode)}
                    >
                      Sao chép mã
                    </Button>
                    <Button size="sm" variant="secondary" onClick={handleEditAsNew}>
                      Sao chép sang bản tập luyện mới
                    </Button>
                  </div>
                  <pre className="max-h-72 overflow-auto rounded border border-line bg-surface p-3 font-mono text-xs text-ink">
                    {sourceQuery.data.sourceCode}
                  </pre>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>

      {/* Dialog xác nhận xóa phiên bản bot */}
      <Dialog
        open={!!deleteBot}
        onOpenChange={(o) => !o && setDeleteBot(null)}
        title={deleteBot ? `Xóa phiên bản v${deleteBot.version} — ${deleteBot.label}?` : ''}
        description="Mã nguồn và các lượt đấu thử của phiên bản này bị xóa vĩnh viễn, không khôi phục được."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteBot(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleteBot && deleteMutation.mutate(deleteBot.id)}
            >
              Xóa vĩnh viễn
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-ink-muted">
            Bot đã được chọn vào bộ bot của một giai đoạn hoặc đã thi đấu chính thức sẽ không xóa được (giữ
            lại để xem lại ván và giải quyết kháng nghị). Nên tải hoặc sao chép mã trước nếu còn cần.
          </p>
          {deleteMutation.error && (
            <Alert tone="error" title="Không xóa được">
              {(deleteMutation.error as Error).message}
            </Alert>
          )}
        </div>
      </Dialog>

      {/* Dialog nộp phiên bản bot mới */}
      <Dialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Nộp phiên bản bot mới"
        description="Tập luyện bằng file/dán code; thi chính thức nộp GitHub với commit cố định. Bot cần hàm def make_move(state)."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) {
              setSubmitError('Vui lòng nhập tên phiên bản.');
              return;
            }
            if (submitMode === 'direct' && !sourceCode.trim()) {
              setSubmitError('Mã nguồn không được để trống.');
              return;
            }
            const teamId = user?.teamId || submitTeamId.trim();
            if (!teamId) {
              setSubmitError('Chọn đội nhận bot trước khi nộp.');
              return;
            }
            const input = SubmitBotInput.safeParse({
              teamId,
              label: label.trim(),
              ...(submitMode === 'github'
                ? {
                    githubRepo: githubRepo.trim(),
                    commitSha: commitSha.trim().toLowerCase(),
                    sourcePath: sourcePath.trim() || 'bot.py',
                  }
                : { sourceCode }),
            });
            if (!input.success) {
              setSubmitError(input.error.issues[0]?.message ?? 'Thông tin nộp bot không hợp lệ.');
              return;
            }
            submitMutation.mutate(input.data);
          }}
        >
          {submitError && (
            <Alert tone="error" title="Lỗi nộp bot">
              {submitError}
            </Alert>
          )}

          {staff && !user?.teamId && (
            <Input
              label="ID đội nhận bot"
              value={submitTeamId}
              onChange={(e) => setSubmitTeamId(e.target.value)}
              required
            />
          )}
          <Input
            maxLength={100}
            label="Tên phiên bản / Nhãn chiến thuật"
            placeholder="Ví dụ: Bot phản công nhanh, v2 chỉnh sửa..."
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Cách nộp bot</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="submit-mode"
                checked={submitMode === 'direct'}
                onChange={() => setSubmitMode('direct')}
              />
              Tập luyện — tải file hoặc dán code
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="submit-mode"
                checked={submitMode === 'github'}
                onChange={() => setSubmitMode('github')}
              />
              Thi chính thức — nộp qua GitHub
            </label>
          </fieldset>

          {submitMode === 'github' ? (
            <div className="flex flex-col gap-3">
              <Input
                label="Repository GitHub"
                placeholder="https://github.com/team/repository"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                required
              />
              <Input
                label="Commit SHA đầy đủ (40 ký tự)"
                value={commitSha}
                onChange={(e) => setCommitSha(e.target.value)}
                minLength={40}
                maxLength={40}
                required
              />
              <Input
                label="Đường dẫn file Python trong repo"
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder="bot.py"
                maxLength={240}
              />
              <p className="text-xs text-ink-muted">
                Hệ thống lưu một bản code cố định. Commit mới trên GitHub không thay đổi bot đã nộp. Nộp trước
                hạn để bot kịp kiểm thử; repo riêng tư cần BTC cấp quyền.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-medium text-ink">Mã nguồn Python:</label>
                <div>
                  <input
                    type="file"
                    accept=".py"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Tải tệp .py từ máy
                  </Button>
                </div>
              </div>
              <textarea
                className="h-80 w-full rounded border border-line bg-surface p-3 font-mono text-xs text-ink focus:border-accent focus:outline-none"
                placeholder={`# Nhập hoặc dán code Python vào đây\ndef make_move(state):\n    # Viết logic chiến thuật của bạn tại đây\n    return {"from": "A1", "to": "B2"}`}
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value)}
                required
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setSubmitOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={submitMutation.isPending}>
              Xác nhận nộp bot
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Dialog Đấu thử (TV2 - Gói việc 4) */}
      <Dialog
        open={!!testRunBot}
        onOpenChange={(o) => {
          if (!o) {
            setTestRunBot(null);
            setActiveTestRunId(null);
          }
        }}
        title={testRunBot ? `Đấu thử: ${testRunBot.label} (v${testRunBot.version})` : 'Đấu thử'}
        className="max-w-3xl"
        description="Chạy một ván đấu thử nghiệm độc lập trong Sandbox Worker mà không tính điểm giải đấu."
      >
        {testRunBot && (
          <div className="flex flex-col gap-4">
            {startTestRunMutation.error && (
              <Alert tone="error" title="Không thể bắt đầu đấu thử">
                {startTestRunMutation.error.message}
              </Alert>
            )}
            {testRunQuery.error && (
              <Alert tone="error" title="Không tải được kết quả">
                {testRunQuery.error.message}
              </Alert>
            )}
            {!activeTestRunId ? (
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="practice-opponent-type" className="text-sm font-semibold text-ink">
                    Loại đối thủ:
                  </label>
                  <select
                    id="practice-opponent-type"
                    className="mt-1 w-full rounded border border-line bg-surface p-2 text-sm text-ink"
                    value={opponentType}
                    onChange={(e) => setOpponentType(e.target.value as 'demo' | 'bot')}
                  >
                    <option value="demo">Bot mẫu của hệ thống</option>
                    <option value="bot">Bot đã nộp của đội mình</option>
                  </select>
                </div>
                {opponentType === 'demo' ? (
                  <div>
                    <label htmlFor="practice-demo-policy" className="text-sm font-semibold text-ink">
                      Chọn đối thủ mẫu:
                    </label>
                    <select
                      id="practice-demo-policy"
                      className="mt-1 w-full rounded border border-line bg-surface p-2 text-sm text-ink"
                      value={opponentPolicy}
                      onChange={(e) => setOpponentPolicy(e.target.value)}
                    >
                      <option value="random">Bot Ngẫu nhiên (Random)</option>
                      <option value="greedy">Bot Tham ăn (Greedy - ưu tiên ăn quân)</option>
                      <option value="rusher">Bot Lao đích (Rusher - phi thẳng về đích)</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="practice-opponent-bot" className="text-sm font-semibold text-ink">
                      Phiên bản bot đối thủ:
                    </label>
                    <select
                      id="practice-opponent-bot"
                      className="mt-1 w-full rounded border border-line bg-surface p-2 text-sm text-ink"
                      value={opponentBotId}
                      onChange={(e) => setOpponentBotId(e.target.value)}
                    >
                      <option value="">Chọn một phiên bản hợp lệ</option>
                      {ownOpponents.map((bot) => (
                        <option key={bot.id} value={bot.id}>
                          v{bot.version} · {bot.label}
                          {bot.id === testRunBot.id ? ' (cùng phiên bản)' : ''}
                        </option>
                      ))}
                    </select>
                    {ownOpponents.length === 0 && (
                      <p className="mt-1 text-xs text-ink-muted">
                        Chưa có bot hợp lệ của đội để chọn làm đối thủ.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label htmlFor="practice-extra-piece" className="text-sm font-semibold text-ink">
                    Quân thứ 10 của đội bạn:
                  </label>
                  <select
                    id="practice-extra-piece"
                    className="mt-1 w-full rounded border border-line bg-surface p-2 text-sm text-ink"
                    value={extraType}
                    onChange={(e) => setExtraType(e.target.value as PieceType)}
                  >
                    <option value="ROCK">Búa — 4 Búa, 3 Bao, 3 Kéo</option>
                    <option value="PAPER">Bao — 3 Búa, 4 Bao, 3 Kéo</option>
                    <option value="SCISSORS">Kéo — 3 Búa, 3 Bao, 4 Kéo</option>
                  </select>
                  <p className="mt-1 text-xs text-ink-muted">Đối thủ giữ quân thứ 10 là Bao.</p>
                </div>

                <div className="rounded border border-line bg-surface-2 p-3 text-xs text-ink-muted">
                  <p>• Trận đấu thử nghiệm hoàn toàn cách ly trong Worker Sandbox.</p>
                  <p>• Bot của bạn sẽ cầm quân Xanh (Blue) và đi trước.</p>
                  <p>• Kết quả và lịch sử từng nước đi sẽ hiển thị ngay sau khi chạy xong.</p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setTestRunBot(null)}>
                    Đóng
                  </Button>
                  <Button
                    loading={startTestRunMutation.isPending}
                    disabled={opponentType === 'bot' && !ownOpponents.some((bot) => bot.id === opponentBotId)}
                    onClick={() => startTestRunMutation.mutate(testRunBot.id)}
                  >
                    Bắt đầu đấu ngay
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {testRunQuery.isLoading && <Spinner label="Đang nạp ván đấu thử..." />}
                {testRunQuery.data && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-line pb-2">
                      <span className="text-sm font-semibold text-ink">Trạng thái:</span>
                      <Badge
                        tone={
                          testRunQuery.data.status === 'succeeded'
                            ? 'success'
                            : testRunQuery.data.status === 'failed'
                              ? 'danger'
                              : 'neutral'
                        }
                        dot
                      >
                        {testRunQuery.data.status === 'succeeded'
                          ? 'Hoàn thành'
                          : testRunQuery.data.status === 'failed'
                            ? 'Thất bại'
                            : 'Đang chạy trong Sandbox...'}
                      </Badge>
                    </div>

                    {testRunQuery.data.status === 'running' || testRunQuery.data.status === 'queued' ? (
                      <div className="flex flex-col items-center justify-center py-6">
                        <Spinner label="Worker đang thực thi ván cờ..." />
                        <p className="mt-2 text-xs text-ink-muted">
                          Tiến trình Sandbox Python đang đọc ghi nước đi qua stdin/stdout...
                        </p>
                      </div>
                    ) : testRunQuery.data.status === 'succeeded' ? (
                      <div className="flex flex-col gap-3">
                        <div className="rounded-lg bg-surface-2 p-4 text-sm">
                          <p className="font-bold text-accent">
                            Kết quả:{' '}
                            {testRunQuery.data.winner === 'blue'
                              ? '🏆 Bot của bạn (Xanh) THẮNG!'
                              : testRunQuery.data.winner === 'pink'
                                ? '❌ Đối thủ (Hồng) THẮNG!'
                                : '🤝 Kết quả HÒA!'}
                          </p>
                          <p className="mt-1 text-xs text-ink-muted">
                            Lý do: <span className="font-semibold text-ink">{testRunQuery.data.reason}</span>{' '}
                            • Tổng số nước:{' '}
                            <span className="font-semibold text-ink">{testRunQuery.data.plies}</span>
                          </p>
                          {testRunQuery.data.logs && (
                            <pre className="whitespace-pre-wrap text-xs">{testRunQuery.data.logs}</pre>
                          )}
                          {testRunQuery.data.piecesLeft && (
                            <p className="mt-1 text-xs text-ink-muted">
                              Số quân còn lại: Xanh {testRunQuery.data.piecesLeft.blue} - Hồng{' '}
                              {testRunQuery.data.piecesLeft.pink}
                            </p>
                          )}
                        </div>

                        <TestRunReplay key={testRunQuery.data.id} run={testRunQuery.data} />

                        {testRunQuery.data.events && testRunQuery.data.events.length > 0 && (
                          <div>
                            <span className="text-xs font-semibold text-ink-muted">
                              Nhật ký diễn biến ván đấu ({testRunQuery.data.events.length} sự kiện):
                            </span>
                            <div className="mt-1 max-h-48 overflow-auto rounded border border-line bg-surface p-2 font-mono text-xs text-ink">
                              {testRunQuery.data.events.map((ev) => (
                                <div key={ev.seq} className="py-0.5 border-b border-line/40 last:border-b-0">
                                  #{ev.seq} [Nước {ev.ply}] {ev.side.toUpperCase()}: {ev.from} ➔ {ev.to}{' '}
                                  {ev.capture ? `(Ăn quân ${ev.capture})` : ''}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Alert tone="error" title="Ván đấu thử gặp lỗi">
                        {testRunQuery.data.error || 'Lỗi không xác định trong lúc chạy Sandbox'}
                      </Alert>
                    )}

                    <div className="flex justify-end gap-2 pt-2 border-t border-line">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setActiveTestRunId(null);
                        }}
                      >
                        Đấu trận khác
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setTestRunBot(null);
                          setActiveTestRunId(null);
                        }}
                      >
                        Đóng
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
