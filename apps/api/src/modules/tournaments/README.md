# tournaments (TV3)

Đã có lịch và quy trình duyệt cấu hình giải/stage, kiểm tra revision, công bố và audit. Chi tiết API, trạng thái, điều kiện và bàn giao: [TV3_CONFIGURATION.md](../../../../../docs/TV3_CONFIGURATION.md). Cấu hình đã công bố được đóng băng; ghép cặp/tính điểm/chốt kết quả vẫn chưa triển khai.

Owner: TV3. Du lieu: Tournament, Stage.

Interface hien co: current, currentId, pairAssignments (501); GET tournaments/current. Module khac chi goi service cong khai, khong import repository. Controller kiem tra HTTP/quyen, service nghiep vu, repository truy cap Prisma.

Viec sau M0: Swiss, standings/tie-break, tranh suat Top 32, cay 32 -> 4, khieu nai/chot ket qua; Pairing/Standing/Appeal chua co schema. Endpoint chua lam tra 501 FEATURE_NOT_IMPLEMENTED kem owner; khong gia thanh cong. Contracts nam o packages/contracts. Xem docs/TEAM.md va docs/DECISIONS.md truoc khi them luat chinh thuc.
