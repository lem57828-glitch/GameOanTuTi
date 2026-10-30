#!/bin/sh
# PYTHON_CMD của bản demo trên Fly (BOT_SANDBOX_MODE=trusted-local, không có Docker trong máy):
# chạy Python của bot bằng user "bot" không quyền, không nhóm phụ, không leo quyền, giới hạn RAM/tiến trình/file.
# User khác với tiến trình API/worker nên bot không đọc được biến môi trường (DATABASE_URL, SESSION_SECRET...)
# qua /proc. Không thay được container cách ly mạng — chỉ dùng cho bản demo; bản chính thức bắt buộc Docker.
exec prlimit --as=536870912 --nproc=64 --nofile=64 --fsize=16777216 -- \
  setpriv --reuid=bot --regid=bot --clear-groups --no-new-privs -- \
  env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 \
  PYTHONHASHSEED="${PYTHONHASHSEED:-0}" \
  python3 "$@"
