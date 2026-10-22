import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, CardHeader } from '@arena/ui';
import type { RoomSnapshot } from '@arena/contracts';
import { Board } from '../components/Board';
import { api } from '../lib/api';

export function HomePage() {
  const room = useQuery({ queryKey: ['home-room'], queryFn: () => api<RoomSnapshot>('/rooms/room_demo_1') });
  return (
    <div className="flex flex-col gap-10">
      <section className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <Badge tone="accent">Đấu trường lập trình bot</Badge>
          <h1 className="mt-5 text-4xl font-black leading-tight sm:text-6xl">
            Code chiến thuật.
            <br />
            <span className="text-accent">Làm chủ bàn cờ.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-muted">
            Xây dựng bot Búa – Bao – Kéo, gặp đối thủ và theo dõi từng nước đi cùng cả cộng đồng.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/login">Thử bản demo</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/rooms">Xem phòng đấu</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-ink-muted">
            M0 dùng bot mô phỏng tin cậy. Chưa nhận bot của thí sinh.
          </p>
        </div>
        <Card className="relative bg-gradient-to-br from-surface-2 to-bg-deep">
          <div className="mb-4 flex items-center justify-between gap-2">
            <span className="font-bold">
              ALPHA <span className="mx-2 text-accent">VS</span> BETA
            </span>
            <Badge>Ván mẫu</Badge>
          </div>
          <Board
            board={
              room.data?.board ?? {
                A1: { side: 'blue', type: 'ROCK' },
                I9: { side: 'pink', type: 'SCISSORS' },
              }
            }
            label="Bàn cờ minh họa trang chủ"
          />
          <p className="mt-3 text-center text-xs text-ink-muted">
            {room.data ? 'Trạng thái đã lưu từ phòng mẫu' : 'Minh họa bàn cờ 9 × 9'}
          </p>
        </Card>
      </section>
      <section aria-label="Ba bước tham gia" className="grid gap-4 md:grid-cols-3">
        {['Đăng nhập và lập đội', 'Chuẩn bị các phiên bản bot', 'Vào phòng, theo dõi trận đấu'].map(
          (title, i) => (
            <Card key={title}>
              <p className="mb-3 font-mono text-2xl font-bold text-accent">0{i + 1}</p>
              <h2 className="font-bold">{title}</h2>
              <p className="mt-2 text-sm text-ink-muted">
                {
                  [
                    'Mỗi người thuộc một đội trong một giải.',
                    'Tính năng nộp và chạy bot thật sẽ có sau M0.',
                    'Phòng công khai cho thí sinh và khán giả.',
                  ][i]
                }
              </p>
            </Card>
          ),
        )}
      </section>
      <Card>
        <CardHeader title="Giải mẫu Bot Arena" subtitle="Sơ loại → Top 32 → Top 4" />
        <p className="text-sm text-ink-muted">
          Bộ khung để cả nhóm phát triển các module. Bán kết, chung kết offline và luật mới sẽ được đặc tả ở
          giai đoạn sau.
        </p>
        <Link to="/tournament" className="mt-4 inline-block font-semibold text-accent">
          Xem thông tin giải →
        </Link>
      </Card>
    </div>
  );
}

export function GuidePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-black">Hướng dẫn thử M0</h1>
      <Alert title="Luồng mô phỏng" tone="info">
        Đây là bản kiểm tra nền tảng, chưa tổ chức giải chính thức.
      </Alert>
      <ol className="list-decimal space-y-4 pl-6 text-ink-muted">
        <li>Vào Đăng nhập mẫu, chọn BTC Demo để tạo ván; chọn sinh viên để xem đội và bot.</li>
        <li>Trong Khu vực BTC, kiểm tra dịch vụ rồi tạo một ván mô phỏng.</li>
        <li>
          Mở phòng đấu để xem tung xu, bàn cờ, nước đi và kết quả. Có thể chia sẻ đường dẫn phòng cho người
          chưa đăng nhập.
        </li>
        <li>
          Tải lại trang hoặc kết nối mạng lại để xem trạng thái đã lưu. Ván và kết quả tung xu được giữ
          nguyên.
        </li>
      </ol>
      <Card>
        <CardHeader title="Các phần làm tiếp" />
        <p className="text-sm leading-relaxed text-ink-muted">
          Đăng nhập thật, đăng ký đội, nộp bot và sandbox, ghép cặp Swiss, cây đấu 32 → 4, chốt bot/quân kín
          và khiếu nại chưa được triển khai ở M0.
        </p>
      </Card>
    </div>
  );
}
