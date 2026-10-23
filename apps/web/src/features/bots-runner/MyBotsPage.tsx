// Bot của tôi. TV2 — Gói việc 1: Nộp bot, quản lý phiên bản, kiểm tra tính hợp lệ & xem mã nguồn.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { Alert, Badge, Button, Card, CardHeader, Dialog, EmptyState, Input, Spinner, Table } from '@arena/ui';
import type { BotSourceDetail, BotVersion, TestRunDetail } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

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

  // State cho Đấu thử (TV2 - Gói việc 4)
  const [testRunBot, setTestRunBot] = useState<BotVersion | null>(null);
  const [opponentPolicy, setOpponentPolicy] = useState('greedy');
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
          opponentType: 'demo',
          opponentTarget: opponentPolicy,
          mySide: 'blue',
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const staff = user?.role === 'admin' || user?.role === 'referee';

  const submitMutation = useMutation({
    mutationFn: (data: { teamId: string; label: string; sourceCode: string }) =>
      api<BotVersion>('/bots', {
        method: 'POST',
        json: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
      setSubmitOpen(false);
      setLabel('');
      setSourceCode('');
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
            subtitle="Mỗi phiên bản bất biến, định danh bằng mã băm SHA-256 chống sửa đổi."
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
                key: 'status',
                header: 'Kiểm tra',
                cell: (b) => (
                  <Badge tone={STATUS[b.status].tone} dot>
                    {STATUS[b.status].label}
                  </Badge>
                ),
              },
              {
                key: 'hash',
                header: 'Mã băm SHA-256',
                cell: (b) => (
                  <span className="font-mono text-xs text-ink-muted">{b.sourceHash.slice(0, 14)}…</span>
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
              <dt className="text-ink-muted">SHA-256 đầy đủ:</dt>
              <dd className="break-all font-mono text-xs text-accent">{selectedBot.sourceHash}</dd>
            </dl>

            {sourceQuery.isLoading && <Spinner label="Đang tải mã nguồn..." />}
            {sourceQuery.error && (
              <Alert tone="error" title="Không tải được mã nguồn">
                {(sourceQuery.error as Error).message}
              </Alert>
            )}

            {sourceQuery.data && (
              <>
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

      {/* Dialog nộp phiên bản bot mới */}
      <Dialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Nộp phiên bản bot mới"
        description="Tải lên tệp .py hoặc dán trực tiếp mã nguồn. Yêu cầu có hàm def make_move(state)."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) {
              setSubmitError('Vui lòng nhập tên phiên bản.');
              return;
            }
            if (!sourceCode.trim()) {
              setSubmitError('Mã nguồn không được để trống.');
              return;
            }
            const teamId = user?.teamId || submitTeamId.trim();
            if (!teamId) {
              setSubmitError('Chọn đội nhận bot trước khi nộp.');
              return;
            }
            submitMutation.mutate({ teamId, label: label.trim(), sourceCode });
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
              className="h-48 w-full rounded border border-line bg-surface p-3 font-mono text-xs text-ink focus:border-accent focus:outline-none"
              placeholder={`# Nhập hoặc dán code Python vào đây\ndef make_move(state):\n    # Viết logic chiến thuật của bạn tại đây\n    return {"from": "A1", "to": "B2"}`}
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              required
            />
          </div>

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
                  <label className="text-sm font-semibold text-ink">Chọn đối thủ mẫu:</label>
                  <select
                    className="mt-1 w-full rounded border border-line bg-surface p-2 text-sm text-ink"
                    value={opponentPolicy}
                    onChange={(e) => setOpponentPolicy(e.target.value)}
                  >
                    <option value="random">Bot Ngẫu nhiên (Random)</option>
                    <option value="greedy">Bot Tham ăn (Greedy - ưu tiên ăn quân)</option>
                    <option value="rusher">Bot Lao đích (Rusher - phi thẳng về đích)</option>
                  </select>
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

                        {testRunQuery.data.events && testRunQuery.data.events.length > 0 && (
                          <div>
                            <span className="text-xs font-semibold text-ink-muted">
                              Nhật ký diễn biến ván đấu ({testRunQuery.data.events.length} sự kiện bàn giao
                              TV4):
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
