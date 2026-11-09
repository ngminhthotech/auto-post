"""Người dẫn chương trình cho cảnh mở đầu bản tin: dựng video người nói khớp khẩu hình từ một ảnh tĩnh
và lời đọc mở đầu (voice[0] do render/voice.py tạo), rồi gắn trường "presenter" vào props của BangTinPro.

Dịch vụ (PRESENTER_SERVICE, mặc định topview nếu có TOPVIEW_API_KEY, ngược lại fal):
- topview: Topview Photo Avatar (Avatar 4). Cần TOPVIEW_API_KEY và TOPVIEW_UID (mục API Settings trong tài khoản Topview),
  credit lấy từ gói Basic/Plus/Pro/Business (gói Unlimited/Ultra/Team không dùng được cho API). Khoảng 0,1 credit/giây.
- fal: fal.ai (hàng đợi queue.fal.run), biến FAL_KEY. Mô hình mặc định Kling AI Avatar v2 Pro; đổi bằng PRESENTER_MODEL.
Video trả về được cắt cho đúng khổ dọc 1080x1920.
Video có gắn nhãn nội dung AI trên hình (xem video/src/v2/PresenterScene.tsx).

Cách dùng:
  python3 render/presenter.py props.json                       # dùng assets/nguoi-dan.jpg, ghi đè props.json
  python3 render/presenter.py props.json --image anh.png
  python3 render/presenter.py props.json --still               # không gọi dịch vụ: ảnh tĩnh chuyển động nhẹ (chạy thử bố cục)
"""
import argparse
import base64
import json
import mimetypes
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "video" / "public"
IMAGE = ROOT / "assets" / "nguoi-dan.jpg"
MODEL = os.environ.get("PRESENTER_MODEL", "fal-ai/kling-video/ai-avatar/v2/pro")
PROMPT = ("Người dẫn chương trình bản tin chuyên nghiệp, ngồi trong trường quay, nhìn thẳng vào ống kính, "
          "nói tự nhiên, thân thiện, cử chỉ tay nhẹ nhàng, đầu gật nhẹ theo nhịp nói, máy quay đứng yên.")


def data_uri(path):
    mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(Path(path).read_bytes()).decode()


def headers():
    h = {"Content-Type": "application/json"}
    if os.environ.get("FAL_KEY"):
        h["Authorization"] = f"Key {os.environ['FAL_KEY']}"
    return h


def duration(f):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                         capture_output=True, text=True, check=True).stdout
    return round(float(out), 2)


def fal(image, audio, out, timeout=1200):
    body = {"image_url": data_uri(image), "audio_url": data_uri(audio)}
    if "kling" in MODEL or "omnihuman/v1.5" in MODEL:
        body["prompt"] = PROMPT
    r = requests.post(f"https://queue.fal.run/{MODEL}", headers=headers(), json=body, timeout=120)
    if r.status_code in (401, 403):
        raise SystemExit(f"fal.ai từ chối khóa API ({r.status_code}): kiểm tra FAL_KEY. {r.text[:200]}")
    if r.status_code >= 400:
        raise SystemExit(f"fal.ai lỗi {r.status_code}: {r.text[:300]}")
    job = r.json()
    status_url, response_url = job["status_url"], job["response_url"]
    end = time.time() + timeout
    while time.time() < end:
        time.sleep(10)
        s = requests.get(status_url, headers=headers(), timeout=60).json()
        if s.get("status") == "COMPLETED":
            break
        if s.get("status") not in ("IN_QUEUE", "IN_PROGRESS"):
            raise SystemExit(f"fal.ai thất bại: {json.dumps(s, ensure_ascii=False)[:300]}")
    else:
        raise SystemExit(f"fal.ai quá thời gian chờ (request {job.get('request_id')})")
    res = requests.get(response_url, headers=headers(), timeout=60).json()
    url = (res.get("video") or {}).get("url")
    if not url:
        raise SystemExit(f"fal.ai không trả video: {json.dumps(res, ensure_ascii=False)[:300]}")
    download(url, out)


TOPVIEW = "https://api.topview.ai/v1"


def tv_headers():
    return {"Authorization": f"Bearer {os.environ['TOPVIEW_API_KEY']}", "Topview-Uid": os.environ["TOPVIEW_UID"]}


def tv_ok(r, what):
    if r.status_code in (401, 403):
        raise SystemExit(f"Topview từ chối khóa API ({r.status_code}) khi {what}: kiểm tra TOPVIEW_API_KEY và TOPVIEW_UID")
    try:
        body = r.json()
    except ValueError:
        raise SystemExit(f"Topview lỗi {r.status_code} khi {what}: {r.text[:300]}")
    if str(body.get("code")) != "200":
        raise SystemExit(f"Topview lỗi khi {what}: {json.dumps(body, ensure_ascii=False)[:300]}")
    return body["result"]


def tv_upload(path):
    ext = Path(path).suffix.lstrip(".").lower()
    cred = tv_ok(requests.get(f"{TOPVIEW}/upload/credential", params={"format": ext}, headers=tv_headers(), timeout=60), "xin chỗ tải file")
    with open(path, "rb") as f:
        requests.put(cred["uploadUrl"], data=f, timeout=300).raise_for_status()
    if not tv_ok(requests.get(f"{TOPVIEW}/upload/check", params={"fileId": cred["fileId"]}, headers=tv_headers(), timeout=60), "kiểm tra file"):
        raise SystemExit(f"Topview chưa nhận được file {path}")
    return cred["fileId"]


def topview(image, audio, out, timeout=900):
    body = {"templateImageFileId": tv_upload(image), "audioFileId": tv_upload(audio), "scriptMode": "audio",
            "mode": os.environ.get("TOPVIEW_MODE", "avatar4"), "customMotion": PROMPT}
    task = tv_ok(requests.post(f"{TOPVIEW}/photo_avatar/task/submit", json=body, headers=tv_headers(), timeout=60), "gửi yêu cầu dựng")
    end = time.time() + timeout
    while time.time() < end:
        time.sleep(8)
        res = tv_ok(requests.get(f"{TOPVIEW}/photo_avatar/task/query", params={"taskId": task["taskId"], "needCloudFrontUrl": "true"},
                                 headers=tv_headers(), timeout=60), "hỏi tiến độ")
        if res.get("status") == "success":
            download(res["finishedVideoUrl"], out)
            print(f"Topview: tốn {res.get('costCredit')} credit", file=sys.stderr)
            return
        if res.get("status") == "fail":
            raise SystemExit(f"Topview dựng thất bại: {res.get('errorMsg')}")
    raise SystemExit(f"Topview quá thời gian chờ (task {task['taskId']})")


def download(url, out):
    with requests.get(url, stream=True, timeout=300) as v:
        v.raise_for_status()
        with open(out, "wb") as f:
            for chunk in v.iter_content(1 << 20):
                f.write(chunk)


def to_vertical(src, out):
    """Đưa video về đúng 1080x1920, 30 hình/giây (cắt phần thừa nếu dịch vụ trả khổ khác), bỏ tiếng (tiếng lấy từ voice[0])."""
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-an", "-vf",
                    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", str(out)], check=True)


def still(image, audio, out):
    """Bản chạy thử không tốn tiền: ảnh tĩnh phóng rất chậm, dài bằng lời đọc."""
    d = duration(audio)
    frames = int(d * 30) + 1
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(image), "-t", str(d),
                    "-vf", f"scale=2160:3840,zoompan=z='1+0.06*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1080x1920:fps=30",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", str(out)], check=True)


def main(argv=None):
    p = argparse.ArgumentParser(prog="render/presenter.py")
    p.add_argument("props", help="props JSON đã có voice (render/voice.py)")
    p.add_argument("--image", default=str(IMAGE))
    p.add_argument("--out", help="ghi props mới ra file khác (mặc định ghi đè)")
    p.add_argument("--still", action="store_true", help="không gọi fal.ai, dùng ảnh tĩnh chuyển động nhẹ")
    a = p.parse_args(argv)
    data = json.loads(Path(a.props).read_text(encoding="utf-8"))
    if not data.get("voice"):
        raise SystemExit("props chưa có voice: chạy render/voice.py trước")
    audio = PUBLIC / data["voice"][0]["src"]
    folder = PUBLIC / "presenter"
    folder.mkdir(parents=True, exist_ok=True)
    out = folder / f"{time.strftime('%Y%m%d-%H%M%S')}.mp4"
    if a.still:
        still(a.image, audio, out)
    else:
        service = os.environ.get("PRESENTER_SERVICE") or ("topview" if os.environ.get("TOPVIEW_API_KEY") else "fal")
        raw = out.with_suffix(".raw.mp4")
        (topview if service == "topview" else fal)(a.image, audio, raw)
        to_vertical(raw, out)
        raw.unlink()
    poster = out.with_suffix(".jpg")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", a.image, "-vf", "scale=1080:1920", str(poster)], check=True)
    data["presenter"] = {"src": f"presenter/{out.name}", "dur": duration(out), "poster": f"presenter/{poster.name}"}
    Path(a.out or a.props).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
