"""Nối các tác vụ với website quản lý (web-quanly): đọc công tắc tạm dừng, danh sách chặn, và báo kết quả chạy.

Website không với tới được (mạng lỗi, chưa có khóa) thì các tác vụ vẫn chạy như bình thường: không dừng,
không chặn, chỉ in cảnh báo ra stderr.

Khóa: biến môi trường AUTOPOST_AGENT_TOKEN, hoặc file /mnt/project-files/auto-post/dashboard/agent-token.txt.
Địa chỉ website: AUTOPOST_WEB_URL (mặc định https://autopost-quanly.autopost-quanly.workers.dev).

Lệnh:
  python3 -m autopost.control config                  # in công tắc và danh sách chặn
  python3 -m autopost.control kiem <kênh>              # thoát mã 3 nếu kênh (hoặc cả hệ thống) đang tạm dừng
  python3 -m autopost.control bao <tác-vụ> --ok "tóm tắt"    # báo một lượt chạy thành công
  python3 -m autopost.control bao <tác-vụ> --loi "lỗi gì"    # báo lỗi (website hiện cảnh báo đỏ)
Kênh: all, facebook, tiktok, youtube, timviecso. Tác vụ: bantin, website-video, timviecso-dang, go-het-han, bao-cao-tuan.
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import requests

URL = os.environ.get("AUTOPOST_WEB_URL", "https://autopost-quanly.autopost-quanly.workers.dev").rstrip("/")
TOKEN_FILE = Path("/mnt/project-files/auto-post/dashboard/agent-token.txt")
TIMEOUT = 15
_cache = None


def _token():
    tok = os.environ.get("AUTOPOST_AGENT_TOKEN", "").strip()
    if not tok and TOKEN_FILE.exists():
        tok = TOKEN_FILE.read_text(encoding="utf-8").strip()
    return tok


def _warn(msg):
    print(f"[control] {msg}", file=sys.stderr)


def config(refresh=False):
    """Công tắc và danh sách chặn; {} nếu không đọc được."""
    global _cache
    if _cache is not None and not refresh:
        return _cache
    tok = _token()
    if not tok:
        _warn("chưa có khóa website quản lý, bỏ qua công tắc và danh sách chặn")
        _cache = {}
        return _cache
    try:
        r = requests.get(f"{URL}/api/agent/config", headers={"Authorization": f"Bearer {tok}"}, timeout=TIMEOUT)
        r.raise_for_status()
        _cache = r.json()
    except (requests.RequestException, ValueError) as exc:
        _warn(f"không đọc được công tắc từ website: {exc}")
        _cache = {}
    return _cache


def paused(key):
    """Tên công tắc đang bật ("all" hoặc key) nếu đang tạm dừng, ngược lại None."""
    pause = config().get("pause") or {}
    now = datetime.now(timezone.utc)
    for k in ("all", key):
        p = pause.get(k) or {}
        if not p.get("on"):
            continue
        until = p.get("until")
        if until and datetime.fromisoformat(until.replace("Z", "+00:00")) <= now:
            continue
        return k
    return None


def _norm(text):
    text = unicodedata.normalize("NFD", str(text or "").lower().replace("đ", "d"))
    return re.sub(r"\s+", " ", "".join(c for c in text if unicodedata.category(c) != "Mn")).strip()


def blocked(employer="", title="", text=""):
    """Lý do chặn nếu nhà tuyển dụng hoặc từ khóa nằm trong danh sách chặn, ngược lại None."""
    block = config().get("block") or {}
    emp = _norm(employer)
    for name in block.get("employers") or []:
        n = _norm(name)
        if n and (n == emp or (len(n) >= 6 and n in emp)):
            return f"nhà tuyển dụng bị chặn ({name})"
    body = _norm(f"{title} {employer} {text}")
    for kw in block.get("keywords") or []:
        k = _norm(kw)
        if k and re.search(rf"(?<!\w){re.escape(k)}(?!\w)", body):
            return f"từ khóa bị chặn ({kw})"
    return None


def report(task, ok, summary="", details="", skipped=False):
    """Báo một lượt chạy về website. Không bao giờ ném lỗi."""
    tok = _token()
    if not tok:
        return False
    if not isinstance(details, str):
        details = json.dumps(details, ensure_ascii=False)
    try:
        r = requests.post(f"{URL}/api/agent/run", headers={"Authorization": f"Bearer {tok}"}, timeout=TIMEOUT,
                          json={"task": task, "ok": bool(ok), "skipped": bool(skipped),
                                "summary": str(summary)[:400], "details": details[:2000]})
        r.raise_for_status()
        return True
    except requests.RequestException as exc:
        _warn(f"không báo được kết quả lên website: {exc}")
        return False


def main(argv=None):
    p = argparse.ArgumentParser(prog="autopost.control", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("config", help="in công tắc và danh sách chặn")
    pk = sub.add_parser("kiem", help="kiểm tra kênh có đang tạm dừng")
    pk.add_argument("key")
    pb = sub.add_parser("bao", help="báo kết quả một lượt chạy")
    pb.add_argument("task")
    g = pb.add_mutually_exclusive_group(required=True)
    g.add_argument("--ok", metavar="TOM_TAT")
    g.add_argument("--loi", metavar="LOI")
    args = p.parse_args(argv)
    if args.cmd == "config":
        print(json.dumps(config(), ensure_ascii=False, indent=1))
        return 0
    if args.cmd == "kiem":
        k = paused(args.key)
        print(json.dumps({"paused": bool(k), "by": k}, ensure_ascii=False))
        return 3 if k else 0
    ok = args.ok is not None
    sent = report(args.task, ok, args.ok if ok else args.loi)
    print(json.dumps({"ok": sent}, ensure_ascii=False))
    return 0 if sent else 1


if __name__ == "__main__":
    sys.exit(main())
