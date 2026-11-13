"""Đăng video bản tin hằng ngày lên mục Video của https://timviecso.vn.

Trang vieclamcantho.tv đã gộp vào timviecso.vn (13/11/2026), nên bản tin không đăng lên vieclamcantho.tv nữa.
timviecso.vn nhận video qua API https://api.timviecso.vn/api/v1/videos (GET liệt kê, POST thêm, DELETE xóa),
cùng form "Thêm video YouTube" trong trang quản trị: {"title", "url", "youtubeId", "description"}.
Video trên trang là video YouTube nhúng, nên bước này chạy SAU khi bài YouTube của bản tin đã lên
(Buffer báo "sent" và có link). Khóa đăng nhập dùng chung với autopost.timviecso: biến môi trường
TIMVIECSO_TOKEN nếu máy chủ đòi (không ghi vào repo).

Lệnh (routine chạy như một lệnh đơn):
  python3 -m autopost.website dang out --date 2026-11-14
      Lấy link YouTube từ out/ket-qua-youtube.json qua Buffer (chờ tối đa --wait phút nếu bài chưa lên),
      thêm video vào timviecso.vn với tiêu đề YouTube (bỏ hashtag), ghi out/ket-qua-website.json và
      chép sang thư mục bài trong project files. Đã có ket-qua-website.json báo ok cho timviecso.vn,
      hoặc trang đã có video cùng YouTube id, thì không đăng lại.
  python3 -m autopost.website dang out --date 2026-11-14 --dry-run
      Chỉ in nội dung sẽ đăng.
  python3 -m autopost.website list
      Liệt kê video trên timviecso.vn.
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import requests

API = "https://api.timviecso.vn/api/v1"
SITE = "timviecso.vn"
TIMEOUT = 60
PROJECT_FILES = Path("/mnt/project-files/auto-post")


class WebsiteError(RuntimeError):
    pass


def call(method, path, **kw):
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if os.environ.get("TIMVIECSO_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['TIMVIECSO_TOKEN']}"
    last = None
    for attempt in range(1, 4):
        try:
            resp = requests.request(method, f"{API}{path}", headers=headers, timeout=TIMEOUT, **kw)
        except requests.RequestException as exc:
            last = str(exc)
        else:
            if resp.status_code < 500 and resp.status_code != 429:
                try:
                    body = resp.json() if resp.content else {}
                except ValueError:
                    body = {}
                if resp.ok and body.get("success") is not False:
                    return body
                raise WebsiteError(f"{method} {path} lỗi {resp.status_code}: "
                                   f"{body.get('message') or body.get('messagge') or resp.text[:500]}")
            last = f"{resp.status_code} {resp.text[:300]}"
        time.sleep(2 ** attempt)
    raise WebsiteError(f"{method} {path} lỗi sau 3 lần thử: {last}")


def videos():
    return call("GET", "/videos").get("data") or []


def youtube_id(link):
    m = re.search(r"(?:shorts/|watch\?v=|youtu\.be/|embed/|live/)([A-Za-z0-9_-]{11})", link or "")
    return m.group(1) if m else None


def youtube_link(folder, wait_minutes):
    """Link bài YouTube của bản tin, lấy qua trạng thái Buffer; chờ nếu bài chưa lên."""
    from autopost import bantin
    deadline = time.time() + wait_minutes * 60
    while True:
        info = bantin.trangthai(folder).get("youtube") or {}
        if info.get("link"):
            return info["link"]
        if info.get("status") == "error" or time.time() >= deadline:
            raise WebsiteError(f"Chưa có link YouTube của bản tin (Buffer: {info.get('status')}, "
                               f"{info.get('error') or 'chưa đăng'})")
        time.sleep(60)


def _strip_tags(text):
    """Bỏ hashtag (#Shorts, #timviec...) và dòng chỉ có hashtag."""
    lines = [re.sub(r"\s*#\w+", "", ln).rstrip() for ln in text.splitlines()]
    out = "\n".join(lines).strip()
    return re.sub(r"\n{3,}", "\n\n", out)


def build(folder, day):
    folder = Path(folder)
    read = lambda n: (folder / n).read_text(encoding="utf-8").strip() if (folder / n).exists() else ""
    title = _strip_tags(read("youtube-tieude.txt"))
    if not title:
        dd, mm = day[8:10], day[5:7]
        title = f"Bản tin Tìm Việc Số {dd}/{mm}: việc làm bán thời gian Cần Thơ cho sinh viên"
    return {"title": title, "description": _strip_tags(read("youtube-mota.txt"))}


def _save(folder, day, out):
    text = json.dumps(out, ensure_ascii=False)
    (Path(folder) / "ket-qua-website.json").write_text(text, encoding="utf-8")
    dest = PROJECT_FILES / f"bai-{day}-0700"
    if dest.is_dir():
        (dest / "ket-qua-website.json").write_text(text, encoding="utf-8")


def dang(folder, day, wait_minutes=30, dry_run=False):
    folder = Path(folder)
    result_file = folder / "ket-qua-website.json"
    if result_file.exists():
        try:
            old = json.loads(result_file.read_text(encoding="utf-8"))
            if old.get("ok") and old.get("site") == SITE:
                return {**old, "skipped": "đã đăng trước đó"}
        except ValueError:
            pass
    payload = build(folder, day)
    link = youtube_link(folder, 0 if dry_run else wait_minutes)
    yid = youtube_id(link)
    if not yid:
        raise WebsiteError(f"Không đọc được YouTube id từ link {link}")
    payload.update(url=f"https://www.youtube.com/shorts/{yid}", youtubeId=yid)
    if dry_run:
        return {"ok": True, "dry_run": True, "site": SITE, "youtube": link, "payload": payload}
    for v in videos():
        if (v.get("youtubeId") or youtube_id(v.get("url"))) == yid:
            out = {"ok": True, "site": SITE, "skipped": "trang đã có video này", "id": v.get("_id"),
                   "youtube": link, "title": v.get("title")}
            break
    else:
        data = call("POST", "/videos", json=payload).get("data") or {}
        if not data.get("_id"):
            raise WebsiteError(f"Thêm video không trả về id: {data}")
        out = {"ok": True, "site": SITE, "id": data["_id"], "youtube": link, "title": payload["title"]}
    _save(folder, day, out)
    return out


def main(argv=None):
    p = argparse.ArgumentParser(prog="autopost.website", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    pd = sub.add_parser("dang", help="đăng video bản tin lên timviecso.vn")
    pd.add_argument("folder")
    pd.add_argument("--date", required=True, help="ngày bản tin, yyyy-mm-dd")
    pd.add_argument("--wait", type=int, default=30, help="số phút tối đa chờ bài YouTube lên (mặc định 30)")
    pd.add_argument("--dry-run", action="store_true")
    sub.add_parser("list", help="video trên timviecso.vn")
    args = p.parse_args(argv)
    try:
        if args.cmd == "list":
            for v in videos():
                print(f"{v.get('_id')}  {(v.get('createdAt') or '')[:10]}  {v.get('title')}  |  {v.get('url')}")
            return 0
        out = dang(args.folder, args.date, args.wait, args.dry_run)
    except Exception as exc:  # báo lỗi gọn cho routine, không làm hỏng các bước khác
        print(json.dumps({"ok": False, "error": str(exc)[-800:]}, ensure_ascii=False))
        return 1
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
