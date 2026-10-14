"""Harness chạy một bot thí sinh. Giao tiếp với máy chủ bằng JSON từng dòng qua stdin/stdout.

Bot phải định nghĩa:  def make_move(state: dict) -> nước đi
(dict {"from": "B4", "to": "C5"}, list ["B4", "C5"] hoặc chuỗi "B4-C5").
Mọi print() của bot được chuyển sang log (stderr), không làm hỏng giao thức.

Đây là lớp chặn "best-effort" (audit hook). Khi thi thật nên chạy kèm BOT_SANDBOX=docker
(--network none, giới hạn RAM/CPU) để cách ly ở mức hệ điều hành.
"""
import importlib.util
import json
import os
import random
import sys
import time

BOT_PATH = os.path.abspath(sys.argv[1])
BOT_DIR = os.path.dirname(BOT_PATH)

# Kênh giao thức = stdout gốc; sau đó fd 1 trỏ về stderr để print() của bot thành log.
proto = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
os.dup2(2, 1)
sys.stderr.reconfigure(encoding="utf-8", errors="replace")
sys.stdout = sys.stderr


def send(obj):
    proto.write(json.dumps(obj) + "\n")
    proto.flush()


def apply_limits(memory_mb):
    try:
        import resource  # chỉ có trên Linux/macOS
        mem = memory_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
        resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    except Exception:
        pass


BLOCKED_IMPORTS = {"socket", "_socket", "ssl", "subprocess", "_posixsubprocess", "multiprocessing",
                   "ctypes", "_ctypes", "urllib.request", "http.client", "ftplib", "smtplib", "asyncio"}
BLOCKED_EVENTS_PREFIX = ("socket.", "subprocess.", "os.system", "os.exec", "os.fork", "os.posix_spawn",
                         "os.spawn", "os.startfile", "os.kill", "ctypes.", "winreg.", "os.remove", "os.rename",
                         "os.rmdir", "shutil.")
ALLOWED_READ_ROOTS = tuple({os.path.abspath(p) for p in (sys.prefix, sys.base_prefix, sys.exec_prefix, BOT_DIR)})


def audit_hook(event, args):
    if event == "import":
        name = args[0]
        if name in BLOCKED_IMPORTS or name.split(".")[0] in {"socket", "subprocess", "multiprocessing", "ctypes"}:
            raise PermissionError(f"Bot không được import {name}")
    elif event.startswith(BLOCKED_EVENTS_PREFIX):
        raise PermissionError(f"Bot không được thực hiện {event}")
    elif event == "open":
        path, mode = args[0], args[1] if len(args) > 1 else "r"
        if isinstance(path, int):
            return
        p = os.path.abspath(os.fsdecode(path))
        writing = isinstance(mode, str) and any(c in mode for c in "wax+")
        if writing:
            if not p.startswith(BOT_DIR):
                raise PermissionError("Bot chỉ được ghi tệp tạm trong thư mục của mình")
        elif not p.startswith(ALLOWED_READ_ROOTS):
            raise PermissionError(f"Bot không được đọc {p}")


def main():
    init = json.loads(sys.stdin.readline())
    sys.dont_write_bytecode = True
    random.seed(init.get("seed", 0))
    apply_limits(init.get("memory_mb", 256))
    sys.addaudithook(audit_hook)
    cpu_limit = init.get("cpu_ms", 100) / 1000.0

    try:
        spec = importlib.util.spec_from_file_location("bot", BOT_PATH)
        bot = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bot)
        fn = getattr(bot, "make_move", None)
        if not callable(fn):
            raise AttributeError("Bot thiếu hàm make_move(state)")
    except BaseException as e:  # noqa: BLE001 - mọi lỗi khởi động đều báo về máy chủ
        send({"type": "error", "msg": f"{type(e).__name__}: {e}"})
        return

    send({"type": "ready"})
    base = init.get("info", {})  # thông tin cố định của ván: màu, ô đích, bảng thắng...

    for line in sys.stdin:
        msg = json.loads(line)
        if msg.get("type") == "end":
            break
        state = dict(base)
        state.update(msg.get("state", {}))
        t0 = time.process_time()
        try:
            move = fn(state)
            cpu = time.process_time() - t0
            if cpu > cpu_limit:
                send({"error": f"Vượt CPU: {cpu * 1000:.0f} ms > {cpu_limit * 1000:.0f} ms", "cpu_ms": cpu * 1000})
            else:
                try:
                    json.dumps(move)
                except (TypeError, ValueError):
                    move = repr(move)
                send({"move": move, "cpu_ms": cpu * 1000})
        except BaseException as e:  # noqa: BLE001
            print(f"[nước {state.get('ply')}] {type(e).__name__}: {e}", file=sys.stderr)
            send({"error": f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    main()
