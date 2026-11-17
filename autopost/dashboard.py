"""Dữ liệu cho bảng điều khiển Auto Post (trang riêng trên claude.ai, mã nguồn ở dashboard/).

Trang chỉ đọc file trong project files, nên lệnh này gom mọi thứ trang cần vào MỘT file JSON:
bài đã đăng qua Buffer (link, lượt xem, tương tác, bài lỗi), tin trên timviecso.vn, video bản tin
trên trang chủ timviecso.vn, thư mục bản tin 7:00 và nhật ký gỡ tin.

Lệnh (tác vụ "Auto Post - Bảng điều khiển" chạy, mỗi lần một lệnh):
  python3 -m autopost.dashboard snapshot
      Ghi /mnt/project-files/auto-post/dashboard/snapshot.json (đổi bằng --out), số ngày bằng --days (mặc định 30).
  python3 -m autopost.dashboard go <id> [<id> ...] --reason "..."
      Gỡ các tin khỏi timviecso.vn, ghi nhật ký vào dashboard/nhat-ky-go.json, rồi cập nhật snapshot.
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from . import timviecso, website
from .buffer import BufferError, gql

VN = ZoneInfo("Asia/Ho_Chi_Minh")
ROOT = Path(__file__).resolve().parent.parent
PROJECT = Path("/mnt/project-files/auto-post")
OUT_DIR = PROJECT / "dashboard"
ENGAGE = ("reactions", "comments", "shares", "clicks")
JOB_URL = "https://timviecso.vn/design24/jobs/{}"

POSTS = """
query($input: PostsInput!, $after: String) {
  posts(first: 50, after: $after, input: $input) {
    edges { node { id status channelService dueAt sentAt externalLink metricsUpdatedAt text
                   error { message } metrics { type value } } }
    pageInfo { hasNextPage endCursor }
  }
}
"""


def _vn(iso):
    if not iso:
        return None
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(VN).strftime("%Y-%m-%d %H:%M")


def buffer_posts(days):
    """Bài trong Buffer của tổ chức Tìm Việc Số: đã đăng, đang hẹn, lỗi, trong `days` ngày."""
    org = json.loads((ROOT / "channels.json").read_text(encoding="utf-8"))["organization"]
    since = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    after = None
    while True:
        data = gql(POSTS, {"input": {"organizationId": org,
                                     "filter": {"status": ["sent", "scheduled", "sending", "error"]}},
                           "after": after})["posts"]
        old = 0
        for edge in data["edges"]:
            n = edge["node"]
            when = n.get("sentAt") or n.get("dueAt")
            if when and datetime.fromisoformat(when.replace("Z", "+00:00")) < since:
                old += 1
                continue
            m = {x["type"]: x["value"] for x in n.get("metrics") or []}
            out.append({
                "id": n["id"],
                "service": n["channelService"],
                "status": n["status"],
                "time_vn": _vn(when),
                "link": n.get("externalLink") or "",
                "title": (n.get("text") or "").split("\n")[0][:120],
                "views": int(m.get("views", m.get("impressions", 0)) or 0),
                "engagement": int(sum(m.get(k, 0) or 0 for k in ENGAGE)),
                "error": (n.get("error") or {}).get("message"),
                "metrics_vn": _vn(n.get("metricsUpdatedAt")),
            })
        if not data["pageInfo"]["hasNextPage"] or (data["edges"] and old == len(data["edges"])):
            break
        after = data["pageInfo"]["endCursor"]
    return sorted(out, key=lambda p: p["time_vn"] or "", reverse=True)


def _source(job):
    for line in reversed(job.get("description") or []):
        m = re.match(r"\s*Nguồn:\s*(\S+)", str(line))
        if m:
            return m.group(1)
    return ""


def jobs():
    out = []
    for j in timviecso.list_jobs():
        out.append({
            "id": j["_id"],
            "title": j.get("title"),
            "employer": (j.get("employer") or {}).get("name"),
            "location": j.get("location"),
            "workType": j.get("workType") or "",
            "salary": j.get("salary"),
            "deadline": (j.get("deadline") or "")[:10],
            "created_vn": _vn(j.get("createdAt")),
            "url": JOB_URL.format(j["_id"]),
            "source": _source(j),
        })
    return sorted(out, key=lambda j: j["created_vn"] or "", reverse=True)


def bulletins(limit=30):
    """Thư mục bản tin 7:00 trong project files: ngày và kết quả từng kênh."""
    out = []
    for d in sorted(PROJECT.glob("bai-*-0700"), reverse=True)[:limit]:
        item = {"folder": d.name, "date": d.name[4:14], "channels": {}}
        for f in d.glob("ket-qua-*.json"):
            try:
                data = json.loads(f.read_text(encoding="utf-8") or "{}")
            except ValueError:
                data = {}
            item["channels"][f.stem[len("ket-qua-"):]] = {
                "ok": data.get("ok"), "id": (data.get("post") or {}).get("id") or data.get("id"),
                "status": (data.get("post") or {}).get("status"), "link": data.get("youtube") or data.get("link"),
                "error": data.get("error")}
        title = d / "youtube-tieude.txt"
        item["title"] = title.read_text(encoding="utf-8").strip() if title.exists() else ""
        out.append(item)
    return out


def stats(posts, job_list, days):
    now = datetime.now(VN)
    by_service = defaultdict(lambda: {"posts": 0, "views": 0, "engagement": 0, "errors": 0})
    for p in posts:
        s = by_service[p["service"]]
        if p["status"] == "sent":
            s["posts"] += 1
            s["views"] += p["views"]
            s["engagement"] += p["engagement"]
        elif p["status"] == "error":
            s["errors"] += 1
    per_day = Counter((j["created_vn"] or "")[:10] for j in job_list)
    days_list = [(now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(13, -1, -1)]
    today = now.strftime("%Y-%m-%d")
    return {
        "days": days,
        "by_service": dict(by_service),
        "jobs_total": len(job_list),
        "jobs_by_type": dict(Counter(j["workType"] or "Khác" for j in job_list)),
        "jobs_by_location": dict(Counter(j["location"] or "Khác" for j in job_list).most_common(8)),
        "jobs_per_day": [{"date": d, "count": per_day.get(d, 0)} for d in days_list],
        "jobs_today": per_day.get(today, 0),
        "jobs_expiring_3d": sum(1 for j in job_list
                                if j["deadline"] and today <= j["deadline"] <= (now + timedelta(days=3)).strftime("%Y-%m-%d")),
    }


def _read_log():
    f = OUT_DIR / "nhat-ky-go.json"
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def snapshot(out=None, days=30):
    errors = {}
    try:
        posts = buffer_posts(days)
    except (BufferError, OSError) as exc:
        posts, errors["buffer"] = [], str(exc)[:300]
    try:
        job_list = jobs()
    except Exception as exc:  # API trang lỗi thì vẫn ghi phần còn lại
        job_list, errors["timviecso"] = [], str(exc)[:300]
    try:
        vids = [{"id": v.get("_id"), "title": v.get("title"), "url": v.get("url"),
                 "created_vn": _vn(v.get("createdAt"))} for v in website.videos()]
    except Exception as exc:
        vids, errors["videos"] = [], str(exc)[:300]
    data = {
        "generated_vn": datetime.now(VN).strftime("%Y-%m-%d %H:%M"),
        "errors": errors,
        "stats": stats(posts, job_list, days),
        "posts": posts,
        "jobs": job_list,
        "videos": vids,
        "bulletins": bulletins() if PROJECT.exists() else [],
        "removed": _read_log()[-100:],
    }
    out = Path(out) if out else OUT_DIR / "snapshot.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(out)
    return {"ok": True, "file": str(out), "posts": len(posts), "jobs": len(job_list), "errors": errors}


def go(ids, reason):
    """Gỡ tin khỏi timviecso.vn theo yêu cầu từ bảng điều khiển, ghi nhật ký."""
    known = {j["_id"]: j for j in timviecso.list_jobs()}
    log = _read_log()
    results = []
    for job_id in ids:
        job = known.get(job_id)
        entry = {"id": job_id, "time_vn": datetime.now(VN).strftime("%Y-%m-%d %H:%M"), "reason": reason,
                 "title": (job or {}).get("title"), "employer": ((job or {}).get("employer") or {}).get("name")}
        if not job:
            entry["status"] = "khong_con_tren_trang"
        else:
            try:
                timviecso.call("DELETE", f"{timviecso.API}/{job_id}")
                entry["status"] = "da_go"
            except timviecso.TimviecsoError as exc:
                entry["status"], entry["error"] = "loi", str(exc)[:300]
        log.append(entry)
        results.append(entry)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "nhat-ky-go.json").write_text(json.dumps(log, ensure_ascii=False, indent=1), encoding="utf-8")
    snap = snapshot()
    return {"ok": all(r["status"] != "loi" for r in results), "results": results, "snapshot": snap["file"]}


def main(argv=None):
    p = argparse.ArgumentParser(prog="autopost.dashboard", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    ps = sub.add_parser("snapshot", help="ghi file dữ liệu cho bảng điều khiển")
    ps.add_argument("--out")
    ps.add_argument("--days", type=int, default=30)
    pg = sub.add_parser("go", help="gỡ tin khỏi timviecso.vn theo yêu cầu từ bảng điều khiển")
    pg.add_argument("ids", nargs="+")
    pg.add_argument("--reason", required=True)
    args = p.parse_args(argv)
    out = snapshot(args.out, args.days) if args.cmd == "snapshot" else go(args.ids, args.reason)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
