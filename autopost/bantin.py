"""Các bước cuối của routine bản tin video 7:00, gom vào một lệnh để routine chạy không bị hỏi quyền.

Routine chỉ cần viết JSON và các file chú thích bằng công cụ ghi file (không dùng heredoc trong Bash),
rồi chạy từng lệnh dưới đây như một lệnh đơn (không ghép `cd ...;`, `&&`, `$(...)`):

  python3 -m autopost.bantin nen out/video.mp4
      Nén bản chính (crf 28, 1.0M) thành out/video-main.mp4 và bản TikTok (crf 30, 0.7M) thành
      out/video-tiktok.mp4, tạo out/khung.png (18 khung hình để xem trước), in độ dài video.

  python3 -m autopost.bantin dang out --date 2026-11-09
      Tải 2 video lên nhánh media, đăng Facebook, TikTok, YouTube qua Buffer (hẹn 7:00 giờ Việt Nam
      nếu còn kịp, không thì đăng ngay), ghi out/ket-qua-<kênh>.json, rồi lưu cả thư mục bài vào
      /mnt/project-files/auto-post/bai-<ngày>-0700/. Kênh đã có ket-qua báo ok thì bỏ qua (không đăng trùng).
      Cần trong thư mục: video-main.mp4, video-tiktok.mp4, caption-facebook.txt, caption-tiktok.txt,
      youtube-tieude.txt, youtube-mota.txt; tùy chọn tiktok-tieude.txt (mặc định "Bản tin việc làm Cần Thơ dd/mm").

  python3 -m autopost.bantin trangthai out
      Xem trạng thái 3 bài trên Buffer (scheduled, sending, sent, error) và link bài.

  python3 -m autopost.bantin luu out --date 2026-11-09
      Chỉ chép thư mục bài sang /mnt/project-files (đã tự làm ở bước dang).
"""

import argparse
import datetime as dt
import json
import shutil
import subprocess
import sys
from pathlib import Path

from autopost import buffer, media

ROOT = Path(__file__).resolve().parent.parent
PROJECT_FILES = Path("/mnt/project-files/auto-post")
VN = dt.timezone(dt.timedelta(hours=7))
# File được chép sang thư mục bài trong project files (video-main.mp4 lưu thành video.mp4).
SAVE = ["video-tiktok.mp4", "bangtin.json", "caption-facebook.txt", "caption-tiktok.txt",
        "youtube-tieude.txt", "youtube-mota.txt", "tiktok-tieude.txt", "loi-doc.txt",
        "ket-qua-facebook.json", "ket-qua-tiktok.json", "ket-qua-youtube.json"]
NEED = ["video-main.mp4", "video-tiktok.mp4", "caption-facebook.txt", "caption-tiktok.txt",
        "youtube-tieude.txt", "youtube-mota.txt"]


def _ffmpeg(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True).stdout.strip()
    return float(out)


def nen(video, out_dir=None):
    video = Path(video)
    out_dir = Path(out_dir) if out_dir else video.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    common = ["-preset", "veryfast", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"]
    main = out_dir / "video-main.mp4"
    tiktok = out_dir / "video-tiktok.mp4"
    sheet = out_dir / "khung.png"
    _ffmpeg("-i", str(video), "-c:v", "libx264", "-crf", "28", "-maxrate", "1.0M", "-bufsize", "2M", *common, str(main))
    _ffmpeg("-i", str(video), "-c:v", "libx264", "-crf", "30", "-maxrate", "0.7M", "-bufsize", "1.4M", *common, str(tiktok))
    secs = duration(video)
    step = max(secs / 18, 1)
    _ffmpeg("-i", str(video), "-vf", f"fps=1/{step:.2f},scale=270:-1,tile=6x3", "-frames:v", "1", str(sheet))
    return {"duration": round(secs, 1), "ok_length": 90 <= secs <= 180,
            "main": str(main), "main_mb": round(main.stat().st_size / 1e6, 1),
            "tiktok": str(tiktok), "tiktok_mb": round(tiktok.stat().st_size / 1e6, 1),
            "frames": str(sheet)}


def _read(path):
    return Path(path).read_text(encoding="utf-8").strip()


def _ok(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8")).get("ok") is True
    except (OSError, ValueError):
        return False


def post_time(date, now=None):
    """7:00 giờ Việt Nam của ngày đăng nếu còn ít nhất 3 phút, không thì None (đăng ngay)."""
    now = now or dt.datetime.now(dt.timezone.utc)
    at = dt.datetime.combine(dt.date.fromisoformat(date), dt.time(7, 0), VN)
    return at.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if at - now > dt.timedelta(minutes=3) else None


def luu(folder, date):
    folder = Path(folder)
    dest = PROJECT_FILES / f"bai-{date}-0700"
    dest.mkdir(parents=True, exist_ok=True)
    saved = []
    if (folder / "video-main.mp4").exists():
        shutil.copy2(folder / "video-main.mp4", dest / "video.mp4")
        saved.append("video.mp4")
    for name in SAVE:
        if (folder / name).exists():
            shutil.copy2(folder / name, dest / name)
            saved.append(name)
    return {"folder": str(dest), "files": saved}


def dang(folder, date, at="auto"):
    folder = Path(folder)
    missing = [n for n in NEED if not (folder / n).exists()]
    if missing:
        raise SystemExit(json.dumps({"ok": False, "error": f"thiếu file: {', '.join(missing)}"}, ensure_ascii=False))
    channels = json.loads((ROOT / "channels.json").read_text(encoding="utf-8"))
    when = post_time(date) if at == "auto" else (at or None)
    urls = media.publish([folder / "video-main.mp4", folder / "video-tiktok.mp4"], date, repo_dir=ROOT)
    dd_mm = dt.date.fromisoformat(date).strftime("%d/%m")
    tiktok_title = _read(folder / "tiktok-tieude.txt") if (folder / "tiktok-tieude.txt").exists() \
        else f"Bản tin việc làm Cần Thơ {dd_mm}"
    jobs = {
        "facebook": ["--channel", channels["facebook"]["id"], "--text-file", str(folder / "caption-facebook.txt"),
                     "--video-url", urls["video-main.mp4"], "--metadata", json.dumps({"facebook": {"type": "post"}})],
        "tiktok": ["--channel", channels["tiktok"]["id"], "--text-file", str(folder / "caption-tiktok.txt"),
                   "--video-url", urls["video-tiktok.mp4"], "--service", "tiktok", "--title", tiktok_title],
        "youtube": ["--channel", channels["youtube"]["id"], "--text-file", str(folder / "youtube-mota.txt"),
                    "--video-url", urls["video-main.mp4"], "--service", "youtube",
                    "--title", _read(folder / "youtube-tieude.txt")],
    }
    result = {"at": when or "ngay", "urls": urls, "posts": {}}
    for name, args in jobs.items():
        out_file = folder / f"ket-qua-{name}.json"
        if _ok(out_file):
            # Không bao giờ đăng lại kênh đã đăng thành công (TikTok trùng video sẽ bị cảnh cáo).
            result["posts"][name] = {"skipped": "đã đăng trước đó", **json.loads(out_file.read_text(encoding="utf-8"))}
            continue
        if name == "tiktok" and out_file.exists():
            # Lần trước TikTok đã gửi đi rồi báo lỗi: không thử lại, chỉ báo cáo.
            result["posts"][name] = {"skipped": "TikTok đã thử trước đó, không đăng lại",
                                     **json.loads(out_file.read_text(encoding="utf-8") or "{}")}
            continue
        cmd = [sys.executable, "-m", "autopost.buffer", "post", *args] + (["--at", when] if when else [])
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        text = (proc.stdout or proc.stderr).strip().splitlines()
        try:
            data = json.loads(text[-1])
        except (IndexError, ValueError):
            data = {"ok": False, "error": (proc.stderr or proc.stdout)[-500:]}
        out_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        result["posts"][name] = data
    result["saved"] = luu(folder, date)
    result["ok"] = all(p.get("ok") for p in result["posts"].values())
    return result


STATUS_QUERY = """query($o: OrganizationId!) { posts(first: 20, input: {organizationId: $o}) {
  edges { node { id status dueAt externalLink error { message } } } } }"""


def trangthai(folder):
    folder = Path(folder)
    channels = json.loads((ROOT / "channels.json").read_text(encoding="utf-8"))
    ids = {}
    for name in ("facebook", "tiktok", "youtube"):
        f = folder / f"ket-qua-{name}.json"
        if f.exists():
            data = json.loads(f.read_text(encoding="utf-8") or "{}")
            if data.get("post", {}).get("id"):
                ids[data["post"]["id"]] = name
    nodes = buffer.gql(STATUS_QUERY, {"o": channels["organization"]})["posts"]["edges"]
    out = {}
    for edge in nodes:
        node = edge["node"]
        if node["id"] in ids:
            out[ids[node["id"]]] = {"id": node["id"], "status": node["status"], "link": node.get("externalLink"),
                                    "error": (node.get("error") or {}).get("message")}
    for pid, name in ids.items():
        out.setdefault(name, {"id": pid, "status": "không thấy trong 20 bài gần nhất"})
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(prog="autopost.bantin", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("nen", help="nén 2 bản video, tạo khung hình xem trước")
    p.add_argument("video")
    p.add_argument("--out-dir")
    p = sub.add_parser("dang", help="tải video lên, đăng 3 kênh, lưu thư mục bài")
    p.add_argument("folder")
    p.add_argument("--date", required=True, help="ngày bản tin, yyyy-mm-dd (giờ Việt Nam)")
    p.add_argument("--at", default="auto", help="auto (mặc định: 7:00 nếu kịp), giờ ISO UTC, hoặc '' để đăng ngay")
    p = sub.add_parser("trangthai", help="trạng thái 3 bài trên Buffer")
    p.add_argument("folder")
    p = sub.add_parser("luu", help="chép thư mục bài sang project files")
    p.add_argument("folder")
    p.add_argument("--date", required=True)
    args = parser.parse_args(argv)
    try:
        if args.cmd == "nen":
            out = nen(args.video, args.out_dir)
        elif args.cmd == "dang":
            out = dang(args.folder, args.date, args.at)
        elif args.cmd == "trangthai":
            out = trangthai(args.folder)
        else:
            out = luu(args.folder, args.date)
    except (subprocess.CalledProcessError, buffer.BufferError) as exc:
        err = getattr(exc, "stderr", None) or str(exc)
        print(json.dumps({"ok": False, "error": str(err)[-800:]}, ensure_ascii=False))
        return 1
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0 if out.get("ok", True) else 1


if __name__ == "__main__":
    sys.exit(main())
