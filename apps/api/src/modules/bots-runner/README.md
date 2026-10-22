# bots-runner (TV2)

Owner: TV2. Du lieu: BotVersion, GameJob, RunAttempt.

Interface hien co: listBots, pickDemoBot, createGameJob, jobView, QueueAdapter; worker qua GameRunner. Module khac chi goi service cong khai, khong import repository. Controller kiem tra HTTP/quyen, service nghiep vu, repository truy cap Prisma.

Viec sau M0: Nop/version bot that, GitHub/upload, kiem thu/sandbox va han muc tai nguyen. Endpoint chua lam tra 501 FEATURE_NOT_IMPLEMENTED kem owner; khong gia thanh cong. Contracts nam o packages/contracts. Xem docs/TEAM.md va docs/DECISIONS.md truoc khi them luat chinh thuc.
