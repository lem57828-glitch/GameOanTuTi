# rooms-matches (TV4)

Owner: TV4. Du lieu: Room, Match, Game, GameChoice, GameResult, GameEvent.

Interface hien co: list, snapshot, gameEvents, createDemoGame; room.join/leave, room.snapshot/event. Module khac chi goi service cong khai, khong import repository. Controller kiem tra HTTP/quyen, service nghiep vu, repository truy cap Prisma.

Viec sau M0: Phong chinh thuc, lua chon bot/quan kin, ready/deadline, replay dieu khien, MatchCompleted. Endpoint chua lam tra 501 FEATURE_NOT_IMPLEMENTED kem owner; khong gia thanh cong. Contracts nam o packages/contracts. Xem docs/TEAM.md va docs/DECISIONS.md truoc khi them luat chinh thuc.
