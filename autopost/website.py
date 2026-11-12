"""Đăng video bản tin hằng ngày lên https://vieclamcantho.tv (mục Truyền hình > Bản tin Việc Làm Cần Thơ).

Trang dùng API https://api.vieclamcantho.tv/api/v1 (đăng nhập POST /login lấy Bearer token, tạo video
POST /videos với youtube_id, ảnh bìa POST /videos/<id>/upload-image). Video trên trang là video YouTube
nhúng, nên bước này chạy SAU khi bài YouTube của bản tin đã lên (Buffer báo "sent" và có link).

Khóa đăng nhập (một trong hai cách, đặt trong môi trường Claude, không ghi vào repo):
  VIECLAMCANTHO_EMAIL + VIECLAMCANTHO_PASSWORD   tài khoản quản trị trang
  VIECLAMCANTHO_TOKEN                            hoặc token đăng nhập sẵn có

Lệnh (routine chạy như một lệnh đơn):
  python3 -m autopost.website dang out --date 2026-11-12
      Lấy link YouTube từ out/ket-qua-youtube.json qua Buffer (chờ tối đa --wait phút nếu bài chưa lên),
      tạo video "Bản tin Việc Làm Cần Thơ" ngày đó trên trang, gắn ảnh bìa (khung hình từ video-main.mp4
      hoặc video.mp4), ghi out/ket-qua-website.json và chép sang thư mục bài trong project files.
      Đã có ket-qua-website.json báo ok, hoặc trang đã có video cùng YouTube id, thì không đăng lại.
  python3 -m autopost.website dang out --date 2026-11-12 --dry-run
      Chỉ in nội dung sẽ đăng.
  python3 -m autopost.website list
      Liệt kê video mới nhất trong mục Bản tin Việc Làm Cần Thơ.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
from datetime import date as Date
from pathlib import Path

import requests

API = "https://api.vieclamcantho.tv/api/v1"
SITE = "https://vieclamcantho.tv"
CATEGORY_ID = 15        # Bản tin Việc Làm Cần Thơ (mục Truyền hình)
CATEGORY_SLUG = "ban-tin-viec-lam-can-tho"
PROGRAM_ID = 14         # chương trình Bản tin Việc Làm Cần Thơ
TAG_IDS = [2, 6]        # Hướng nghiệp, Tin tức
TIMEOUT = 60
PROJECT_FILES = Path("/mnt/project-files/auto-post")


class WebsiteError(RuntimeError):
    pass


_token = None


def token():
    global _token
    if _token:
        return _token
    if os.environ.get("VIECLAMCANTHO_TOKEN"):
        _token = os.environ["VIECLAMCANTHO_TOKEN"]
        return _token
    email, password = os.environ.get("VIECLAMCANTHO_EMAIL"), os.environ.get("VIECLAMCANTHO_PASSWORD")
    if not (email and password):
        raise WebsiteError("Chưa có khóa đăng nhập vieclamcantho.tv: cần biến môi trường "
                           "VIECLAMCANTHO_EMAIL và VIECLAMCANTHO_PASSWORD (hoặc VIECLAMCANTHO_TOKEN)")
    resp = requests.post(f"{API}/login", json={"email": email, "password": password}, timeout=TIMEOUT)
    body = resp.json() if resp.content else {}
    if not resp.ok or not body.get("token"):
        raise WebsiteError(f"Đăng nhập vieclamcantho.tv lỗi {resp.status_code}: {body.get('message') or resp.text[:300]}")
    _token = body["token"]
    return _token


def call(method, path, auth=True, **kw):
    headers = kw.pop("headers", {})
    headers.setdefault("Accept", "application/json")
    if auth:
        headers["Authorization"] = f"Bearer {token()}"
    last = None
    for attempt in range(1, 4):
        try:
            resp = requests.request(method, f"{API}{path}", headers=headers, timeout=TIMEOUT, **kw)
        except requests.RequestException as exc:
            last = str(exc)
        else:
            if resp.status_code < 500 and resp.status_code != 429:
                body = resp.json() if resp.content else {}
                if resp.ok and body.get("success") is not False:
                    return body
                raise WebsiteError(f"{method} {path} lỗi {resp.status_code}: {body.get('message') or resp.text[:500]}")
            last = f"{resp.status_code} {resp.text[:300]}"
        time.sleep(2 ** attempt)
    raise WebsiteError(f"{method} {path} lỗi sau 3 lần thử: {last}")


def bulletin_videos(per_page=20):
    body = call("GET", "/videos", auth=False,
                params={"per_page": per_page, "sort_by": "publish_date", "sort_order": "desc"})
    return [v for v in body.get("data") or [] if v.get("category_id") == CATEGORY_ID]


def youtube_id(link):
    m = re.search(r"(?:shorts/|watch\?v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", link or "")
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


def _slug(text):
    s = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
    s = s.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:120]


def build(folder, day):
    folder = Path(folder)
    d = Date.fromisoformat(day)
    dmy = d.strftime("%d/%m/%Y")
    yt_title = (folder / "youtube-tieude.txt").read_text(encoding="utf-8").strip() \
        if (folder / "youtube-tieude.txt").exists() else ""
    topic = re.sub(r"\s*#\w+", "", yt_title).strip()
    title = f"Bản tin Việc Làm Cần Thơ ngày {dmy}"
    if topic:
        title += f" | {re.sub(r'\s*\d{1,2}/\d{1,2}(/\d{4})?', '', topic).strip(' :|-')}"
    desc_file = folder / "caption-facebook.txt"
    if not desc_file.exists():
        desc_file = folder / "youtube-mota.txt"
    description = desc_file.read_text(encoding="utf-8").strip() if desc_file.exists() else ""
    return {
        "title": title[:250],
        "slug": f"ban-tin-viec-lam-can-tho-{d.strftime('%d-%m-%Y')}",
        "description": description,
        "publish_date": day,
        "is_live": False,
        "is_highlight": True,
        "is_active": True,
        "category_id": CATEGORY_ID,
        "program_id": PROGRAM_ID,
        "tag_ids": TAG_IDS,
    }


def thumbnail(folder):
    """Khung hình cảnh mở đầu (người dẫn) làm ảnh bìa; None nếu không có video."""
    folder = Path(folder)
    video = next((folder / n for n in ("video-main.mp4", "video.mp4") if (folder / n).exists()), None)
    if not video:
        return None
    out = Path(tempfile.mkdtemp()) / "anh-bia.jpg"
    try:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "4", "-i", str(video), "-frames:v", "1",
                        "-vf", "scale='min(1080,iw)':-2", "-q:v", "3", str(out)], check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    return out


def dang(folder, day, wait_minutes=30, dry_run=False):
    folder = Path(folder)
    result_file = folder / "ket-qua-website.json"
    if result_file.exists():
        try:
            old = json.loads(result_file.read_text(encoding="utf-8"))
            if old.get("ok"):
                return {**old, "skipped": "đã đăng trước đó"}
        except ValueError:
            pass
    payload = build(folder, day)
    link = youtube_link(folder, 0 if dry_run else wait_minutes)
    payload["youtube_id"] = youtube_id(link)
    if not payload["youtube_id"]:
        raise WebsiteError(f"Không đọc được YouTube id từ link {link}")
    if dry_run:
        return {"ok": True, "dry_run": True, "youtube": link, "payload": payload}
    for v in bulletin_videos(200):
        if (v.get("youtube_id") or youtube_id(v.get("youtube_url"))) == payload["youtube_id"] or v.get("slug") == payload["slug"]:
            out = {"ok": True, "skipped": "trang đã có video này", "id": v["id"],
                   "url": f"{SITE}/truyen-hinh/{CATEGORY_SLUG}/{v['slug']}", "youtube": link}
            break
    else:
        tag_ids = payload.pop("tag_ids")
        data = call("POST", "/videos", json=payload).get("data") or {}
        vid = data.get("id")
        if not vid:
            raise WebsiteError(f"Tạo video không trả về id: {data}")
        warn = []
        try:
            call("POST", f"/videos/{vid}/tags", json={"tag_ids": tag_ids})
        except WebsiteError as exc:
            warn.append(f"gắn thẻ: {exc}")
        img = thumbnail(folder)
        if img:
            try:
                with open(img, "rb") as f:
                    call("POST", f"/videos/{vid}/upload-image", files={"image": ("anh-bia.jpg", f, "image/jpeg")})
            except WebsiteError as exc:
                warn.append(f"ảnh bìa: {exc}")
        out = {"ok": True, "id": vid, "url": f"{SITE}/truyen-hinh/{CATEGORY_SLUG}/{data.get('slug') or payload['slug']}",
               "youtube": link, "title": payload["title"]}
        if warn:
            out["warnings"] = warn
    result_file.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    dest = PROJECT_FILES / f"bai-{day}-0700"
    if dest.is_dir():
        (dest / "ket-qua-website.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def main(argv=None):
    p = argparse.ArgumentParser(prog="autopost.website", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    pd = sub.add_parser("dang", help="đăng video bản tin lên vieclamcantho.tv")
    pd.add_argument("folder")
    pd.add_argument("--date", required=True, help="ngày bản tin, yyyy-mm-dd")
    pd.add_argument("--wait", type=int, default=30, help="số phút tối đa chờ bài YouTube lên (mặc định 30)")
    pd.add_argument("--dry-run", action="store_true")
    sub.add_parser("list", help="video mới nhất trong mục Bản tin Việc Làm Cần Thơ")
    args = p.parse_args(argv)
    try:
        if args.cmd == "list":
            for v in bulletin_videos():
                print(f"{v['id']}  {(v.get('publish_date') or '')[:10]}  {v['title']}  |  https://youtu.be/{v.get('youtube_id')}")
            return 0
        out = dang(args.folder, args.date, args.wait, args.dry_run)
    except Exception as exc:  # báo lỗi gọn cho routine, không làm hỏng các bước khác
        print(json.dumps({"ok": False, "error": str(exc)[-800:]}, ensure_ascii=False))
        return 1
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
