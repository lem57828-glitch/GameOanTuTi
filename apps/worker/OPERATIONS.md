# TÀI LIỆU VẬN HÀNH WORKER & THIẾT LẬP CỤM 4 LAPTOP PHÂN TÁN
> **Vai trò**: Thành viên 2 (TV2 — Phụ trách Bot, Luật cờ, Sandbox & Vận hành Worker)  
> **Dự án**: GameOanTuTi — Đấu trường Cờ Oẳn Tù Tì

---

## 1. TỔNG QUAN KIẾN TRÚC WORKER SANDBOX
Tiến trình Worker chịu trách nhiệm nhận lệnh thực thi ván cờ từ Redis BullMQ, chạy mã nguồn Bot Python trong môi trường cách ly (Process Sandbox), kiểm tra luật cờ và lưu kết quả vào PostgreSQL.

### Cơ chế an ninh & Hiệu năng:
1. **Persistent Process (Tiến trình duy trì)**: Khởi động Python 1 lần duy nhất đầu ván và giao tiếp qua `stdin/stdout` $\rightarrow$ Độ trễ chỉ **~1.87ms / nước đi**.
2. **Sanitized Environment**: Lọc sạch toàn bộ biến môi trường nhạy cảm (`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`). Bot không thể đọc trộm thông tin máy chủ.
3. **Giới hạn thời gian (Timeouts)**:
   - Startup Timeout: Tối đa 3.0 giây nạp thư viện.
   - Wall-clock Move Timeout: Tối đa 1.0 giây / nước đi (quá hạn tự động bắn hạ và xử thua do `timeout`).
4. **Cô lập thư mục (`mkdtemp`)**: Mã nguồn được nạp vào thư mục tạm dùng một lần và tự động xóa sạch khi kết thúc ván đấu.

---

## 2. HƯỚNG DẪN THIẾT LẬP CỤM 4 LAPTOP PHÂN TÁN (DISTRIBUTED WORKER CLUSTER)
Hệ thống hỗ trợ gom 4 laptop của 4 thành viên thành một cụm tính toán hợp nhất, nâng công suất xử lý lên tới **>2.000 ván/phút**.

```
                           [MÁY CHỦ MASTER - TV2]
                       (IP Tailscale: 100.x.y.z)
              ┌──────────────────────────────────────────┐
              │  - PostgreSQL: 5432                      │
              │  - Redis BullMQ: 6379                    │
              │  - Backend API NestJS: 3100              │
              │  - Web Vite: 5173                        │
              └────────────────────┬─────────────────────┘
                                   │ (Mạng VPN Tailscale / LAN)
     ┌─────────────────────────────┼─────────────────────────────┬─────────────────────────────┐
     ▼                             ▼                             ▼                             ▼
[LAPTOP TV1]                  [LAPTOP TV2]                  [LAPTOP TV3]                  [LAPTOP TV4]
WORKER-01                     WORKER-02                     WORKER-03                     WORKER-04
concurrency=2                 concurrency=2                 concurrency=2                 concurrency=2
```

### Bước 1: Kết nối mạng qua Tailscale (Dùng cho cả khi ngồi cùng phòng hoặc ở nhà)
1. Cả 4 thành viên cài đặt ứng dụng [Tailscale](https://tailscale.com/) (miễn phí).
2. Đăng nhập chung một tài khoản (hoặc kết nối chung mạng lưới Tailnet).
3. **Máy chủ Master (Laptop TV2)**: Xem IP Tailscale của máy mình (Ví dụ: `100.85.12.34`).
4. Mở cổng firewall trên máy Master cho PostgreSQL (5432) và Redis (6379) chấp nhận kết nối từ dải IP Tailscale (`100.x.y.z`).

### Bước 2: Cấu hình file `.env` trên từng Laptop

#### A. Cấu hình trên Laptop Master (TV2):
```env
NODE_ENV=production
DATABASE_URL=postgresql://arena:arena_dev_password@127.0.0.1:5432/arena?schema=public
REDIS_URL=redis://127.0.0.1:6379
WORKER_ID=worker-laptop-tv2
WORKER_CONCURRENCY=2
```

#### B. Cấu hình trên 3 Laptop Thành viên (TV1, TV3, TV4):
Chỉ cần trỏ địa chỉ IP về máy Master (`100.85.12.34`):
```env
NODE_ENV=production
# Trỏ về IP Tailscale của máy Master TV2:
DATABASE_URL=postgresql://arena:arena_dev_password@100.85.12.34:5432/arena?schema=public
REDIS_URL=redis://100.85.12.34:6379
# Đặt mã định danh riêng cho từng máy:
WORKER_ID=worker-laptop-tv1   # (Máy TV3 đặt tv3, TV4 đặt tv4)
WORKER_CONCURRENCY=2
```

### Bước 3: Khởi động Worker trên cả 4 máy
Mỗi thành viên chỉ cần mở Terminal trên máy mình và chạy lệnh:
```bash
pnpm --filter @arena/worker start
```
- Khi khởi động, Worker sẽ ghi log:
  `[worker worker-laptop-tvX] Sẵn sàng: hàng đợi arena:arena-games, concurrency 2, runner sandbox Python.`
- 4 máy sẽ tự động cùng lắng nghe hàng đợi BullMQ và chia nhau xử lý các ván cờ.

---

## 3. CƠ CHẾ CHỐNG LỖI & TỰ ĐỘNG PHỤC HỒI (FAULT TOLERANCE)

1. **Khóa xử lý độc quyền (Lease Lock)**:
   - Mỗi ván cờ được trao quyền độc quyền (`leaseOwner: worker-laptop-tv1`, thời hạn `leaseUntil: +60s`).
   - Các laptop khác tuyệt đối không gắp trùng ván cờ này.

2. **Xử lý sự cố khi 1 Laptop mất mạng hoặc sập nguồn**:
   - Nếu Laptop TV3 bị mất điện, ván cờ đang chạy dở sẽ hết hạn Lease sau 60 giây.
   - Tiến trình Quét job kẹt (`sweepStale` trong `BotsRunnerService`) chạy mỗi 30 giây sẽ phát hiện ra job bị bỏ rơi và đưa ngược lại vào hàng đợi để Laptop khác (TV1 hoặc TV2) nhận lại và chạy tiếp.

3. **Giám sát sức khỏe (Worker Heartbeat)**:
   - Mỗi 3 giây, từng Worker tự động gửi nhịp tim (`heartbeat`) lên Redis key `arena:worker:<workerId>:heartbeat`.
   - Trang quản trị BTC có thể xem ngay danh sách các laptop đang trực tuyến trong cụm.

---

## 4. KẾT QUẢ ĐO LƯỜNG HIỆU NĂNG (BENCHMARK)
Kết quả đo đạc thực tế từ script `apps/worker/src/benchmark.ts`:

- **Độ trễ trung bình mỗi nước đi**: **1.87 ms / ply**
- **Thời gian hoàn thành 1 ván 60 nước**: **~112 ms**
- **Năng lực xử lý của 1 Laptop**: **~530 ván / phút**
- **Năng lực toàn CỤM 4 LAPTOP**: **> 2.100 ván / phút**
$\rightarrow$ Thừa sức đáp ứng toàn bộ các vòng đấu loại và vòng chung kết của giải đấu mà không gặp bất kỳ hiện tượng nghẽn hàng đợi nào!
