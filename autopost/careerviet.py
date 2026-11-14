"""Quét tin mới nhất trên CareerViet (Cần Thơ, các tỉnh ĐBSCL, TP.HCM) rồi đăng lên timviecso.vn/design24/jobs.

Cân bằng khu vực: mỗi tin đăng vào khu vực đang thiếu nhất so với tỉ lệ mong muốn
(WEIGHT: Cần Thơ 4, ĐBSCL 3, TP.HCM 2, tức khoảng 45% / 33% / 22% số tin trên trang).
Hòa thì ưu tiên Cần Thơ, rồi ĐBSCL, rồi TP.HCM. Khu vực thiếu nhất không có tin mới thì lấy khu vực kế tiếp.

Chạy bằng GitHub Actions (.github/workflows/quet-tin.yml), không cần Claude. Lịch của GitHub
hay trễ, nên mỗi lần chạy giữ máy khoảng 50 phút và tự quét 5 phút một lần (--loop-minutes, --every).
Mỗi lượt đăng tối đa --max tin mới (mặc định 2, để tin lên đều); hết tin mới thì chờ lượt sau.
Tác vụ Claude mỗi giờ rà lại các tin đã đăng và gỡ tin có vấn đề.

Cân bằng loại hình (từ 14/11/2026): trang chủ timviecso.vn chia 3 cột theo trường workType
(Thực tập, Bán thời gian, Toàn thời gian). Mỗi ngày (giờ Việt Nam) ưu tiên đăng đủ hạn mức
DAILY_QUOTA tin Thực tập và tin Bán thời gian / Thời vụ trước (loại nào đăng hôm nay ít hơn so với
hạn mức thì trước), lấy từ tìm kiếm theo từ khóa trên CareerViet, nơi làm việc chính ở Cần Thơ,
ĐBSCL hoặc TP.HCM; đủ hạn mức hoặc hết tin thì đăng tin toàn thời gian theo khu vực như trên.
Loại hình lấy từ job_type của CareerViet (4 ký tự: chính thức, bán thời gian, thời vụ, thực tập).

Lọc cố định: còn hạn nộp, có tên công ty (bỏ tin ẩn danh), không có dấu hiệu thu phí,
chưa có trên trang (so link gốc và tên công ty + tiêu đề). Tin thực tập, bán thời gian lọc thêm:
bỏ việc online, tại nhà, làm từ xa, bảo hiểm, tài chính, bất động sản, đa cấp.

Ví dụ:
  python -m autopost.careerviet --dry-run
  python -m autopost.careerviet --max 2
  python -m autopost.careerviet --max 2 --loop-minutes 50 --every 5
  python -m autopost.careerviet --max 5 --quota 2     # hạn mức 2 tin thực tập, 2 tin bán thời gian mỗi ngày
"""

import argparse
import html
import json
import re
import sys
import time
from datetime import date, datetime
from zoneinfo import ZoneInfo

import requests

from autopost import timviecso

SITE = "https://careerviet.vn"
DETAIL = "https://internal-api.careerviet.vn/api/v1/js/jsk/jobs/detail/public"
HEADERS = {"User-Agent": "Mozilla/5.0"}
TIMEOUT = 60
CAN_THO = 71
# An Giang, Bạc Liêu, Bến Tre, Cà Mau, Đồng Tháp, Hậu Giang, Kiên Giang, Sóc Trăng,
# Tiền Giang, Trà Vinh, Vĩnh Long, "Mekong Delta" (mã tỉnh của CareerViet; Long An đã nhập vào Tây Ninh).
MEKONG = [76, 781, 75, 78, 67, 780, 77, 79, 73, 74, 70, 1064]
HCM = 8
# Khu vực theo thứ tự ưu tiên: (nhãn location trên timviecso, mã tỉnh CareerViet, trọng số).
REGIONS = [
    ("TP Cần Thơ", [CAN_THO], 4),
    ("Đồng bằng sông Cửu Long", MEKONG, 3),
    ("TP HCM", [HCM], 2),
]
JOB_LINK = re.compile(r"/vi/tim-viec-lam/[a-z0-9-]+\.([0-9A-F]{8})\.html")
# Loại hình đúng như ô chọn trên form của trang (trang chủ chia cột theo chữ "thực tập", "bán thời gian").
FULL_TIME, PART_TIME, INTERN = "Toàn thời gian", "Bán thời gian / Thời vụ", "Thực tập"
# Từ khóa tìm trên CareerViet cho từng loại hình (careerviet.vn/viec-lam/<từ khóa>-k[-trang-N]-vi.html).
KEYWORDS = {INTERN: ["thuc-tap-sinh", "thuc-tap", "intern"], PART_TIME: ["part-time", "ban-thoi-gian", "thoi-vu"]}
KEYWORD_PAGES = 3
# Số tin mỗi loại cần đăng mỗi ngày (giờ Việt Nam) trước khi quay về tin toàn thời gian.
DAILY_QUOTA = 3
VN = ZoneInfo("Asia/Ho_Chi_Minh")
INTERN_TITLE = re.compile(r"thực tập|thuc tap|\btts\b|intern|trainee|học việc", re.I)
PART_TITLE = re.compile(r"part[\s-]?time|bán thời gian|thời vụ|theo ca|làm thêm|\bca (sáng|chiều|tối)\b", re.I)
# Việc thực tập, bán thời gian hay bị lợi dụng: bỏ việc online, tại nhà, ăn hoa hồng tài chính, đa cấp.
RISKY = re.compile(r"tại nhà|online|remote|từ xa|work from home|\bwfh\b|cần laptop|bảo hiểm|nhân thọ|thẻ tín dụng|"
                   r"mở thẻ|cho vay|vay tiêu dùng|trả góp|thu hồi nợ|đòi nợ|bất động sản|\bbđs\b|chứng khoán|đa cấp|"
                   r"kinh doanh theo mạng|nhiệm vụ|kiếm tiền|hoa hồng cao", re.I)
# Dấu hiệu tin đòi tiền người lao động.
SCAM = re.compile(r"đặt cọc|nộp phí|phí hồ sơ|phí đào tạo|phí đồng phục|đóng phí|chuyển khoản trước|"
                  r"việc nhẹ lương cao|không cần kinh nghiệm.{0,20}thu nhập khủng", re.I)
# Dòng có yêu cầu phân biệt thì bỏ khỏi tin.
BIASED = re.compile(r"ngoại hình|giới tính|chiều cao|cân nặng|độ tuổi|^\W*(nam|nữ)\b", re.I)


def list_ids(location_id):
    """Mã tin trên trang đầu của một tỉnh, kèm link tin."""
    resp = requests.get(f"{SITE}/viec-lam/tinh-l{location_id}-vi.html", headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    return {m.group(1): SITE + m.group(0) for m in JOB_LINK.finditer(resp.text)}


def search_ids(keyword, pages=KEYWORD_PAGES):
    """Mã tin tìm theo từ khóa trên toàn quốc (lọc khu vực sau khi đọc chi tiết tin)."""
    out = {}
    for page in range(1, pages + 1):
        suffix = f"-trang-{page}" if page > 1 else ""
        resp = requests.get(f"{SITE}/viec-lam/{keyword}-k{suffix}-vi.html", headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        found = {m.group(1): SITE + m.group(0) for m in JOB_LINK.finditer(resp.text)}
        if not found:
            break
        for job_id, link in found.items():
            out.setdefault(job_id, link)
    return out


def work_type(d):
    """Loại hình theo job_type CareerViet (chính thức, bán thời gian, thời vụ, thực tập) và tên vị trí."""
    jt = (d.get("job_type") or "").ljust(4, "0")
    title = d.get("job_title") or ""
    if jt[3] == "1" and (jt[0] != "1" or INTERN_TITLE.search(title)):
        return INTERN
    if (jt[1] == "1" or jt[2] == "1") and (jt[0] != "1" or PART_TITLE.search(title)):
        return PART_TIME
    return FULL_TIME


def detail(job_id):
    resp = requests.get(DETAIL, params={"job_id": job_id, "user_id": "", "my_job": 0}, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json().get("data") or {}


def lines(raw):
    """HTML mô tả thành danh sách dòng, bỏ dấu đầu dòng và dòng có yêu cầu phân biệt."""
    text = re.sub(r"<\s*(br|/p|/li|/div|/h\d)[^>]*>", "\n", raw or "", flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    out = []
    for line in text.splitlines():
        line = re.sub(r"^[\s\-–•·*+●○▪]+", "", line).strip()
        if line and not BIASED.search(line):
            out.append(line)
    return out


def money(d):
    lo, hi = d.get("job_from_salary") or 0, d.get("job_to_salary") or 0
    if d.get("job_salary_unit") != "vnd" or not (lo or hi):
        return "Thỏa thuận"
    fmt = lambda v: f"{v / 1e6:g}"
    if lo and hi:
        return f"{fmt(lo)} - {fmt(hi)} triệu"
    return f"Từ {fmt(lo)} triệu" if lo else f"Đến {fmt(hi)} triệu"


def experience(d):
    lo, hi = d.get("job_experience") or 0, d.get("job_to_experience") or 0
    if not d.get("job_is_experience") or not (lo or hi):
        return "Chưa cập nhật"
    return f"{lo} - {hi} năm" if lo and hi else f"Từ {lo or hi} năm"


def region_of(location_id):
    return next(r for r in REGIONS if location_id in r[1])


def to_job(d, link, location_id):
    """Chuyển tin CareerViet sang dạng tin của timviecso; trả về (tin, lý do loại)."""
    if d.get("job_is_public") == 0:
        return None, "tin không công khai"
    if d.get("location_id") not in region_of(location_id)[1]:
        return None, f"nơi làm việc chính ngoài khu vực ({d.get('location_name_vn')})"
    company = (d.get("emp_name") or d.get("job_contact_company") or "").strip()
    if not company or re.fullmatch(r"confidential|bảo mật|giấu tên|ẩn danh|công ty ẩn danh", company, re.I):
        return None, "không có tên công ty"
    deadline = (d.get("job_last_date") or "")[:10]
    if not deadline or deadline < date.today().isoformat():
        return None, "hết hạn"
    body = " ".join([d.get("job_content") or "", d.get("job_require_skill") or "", d.get("job_benefit") or ""])
    if SCAM.search(html.unescape(re.sub(r"<[^>]+>", " ", body))):
        return None, "có dấu hiệu thu phí"
    kind = work_type(d)
    if kind != FULL_TIME and (RISKY.search(d.get("job_title") or "") or RISKY.search(company)):
        return None, "việc online, tại nhà, tài chính, bảo hiểm hoặc đa cấp"
    places = [w for w in d.get("job_workstation") or [] if w.get("location_id") == location_id] or d.get("job_workstation") or []
    industries = d.get("industries") or []
    description = lines(d.get("job_content")) + ["Ứng tuyển: nộp đơn trực tiếp tại link tin gốc. Không mất phí."]
    return {
        "title": d.get("job_title", "").strip(),
        "originalTitle": d.get("job_title", "").strip(),
        "location": region_of(location_id)[0],
        "employer": {"name": company, "logo": d.get("emp_logo") or "",
                     "industry": industries[0]["industry_name_vn"] if industries else ""},
        "salary": money(d),
        "deadline": deadline,
        "workType": kind,
        "workingTime": (d.get("job_work_time") or "").strip() or "Chưa cập nhật",
        "experience": experience(d),
        "education": d.get("degree_name_vn") or "Chưa cập nhật",
        "quantity": 1,
        "address": "; ".join(w["emp_work_location"] for w in places[:2] if w.get("emp_work_location"))
                   or d.get("location_name_vn") or "Chưa cập nhật",
        "description": description,
        "requirements": lines(d.get("job_require_skill")) or ["Chưa cập nhật"],
        "benefits": [b["benefit_name_vn"] for b in d.get("benefits") or [] if b.get("benefit_name_vn")],
        "source": link,
    }, None


def region_order(counts):
    """Khu vực thiếu nhất so với trọng số đứng trước; hòa thì theo thứ tự ưu tiên."""
    return sorted(REGIONS, key=lambda r: (counts.get(r[0], 0) / r[2], REGIONS.index(r)))


def kind_of(job):
    """Cột trên trang chủ của một tin đã đăng (cùng cách trang chủ chia cột)."""
    t = timviecso._key(job.get("workType"))
    if "thuc tap" in t or "intern" in t:
        return INTERN
    if "ban thoi gian" in t or "part time" in t:
        return PART_TIME
    return FULL_TIME


def posted_today(posted, today):
    """Số tin mỗi loại hình đã đăng trong ngày (giờ Việt Nam)."""
    out = {}
    for j in posted:
        try:
            day = datetime.fromisoformat((j.get("createdAt") or "").replace("Z", "+00:00")).astimezone(VN).date()
        except ValueError:
            continue
        if day == today:
            out[kind_of(j)] = out.get(kind_of(j), 0) + 1
    return out


def scan(max_posts, dry_run=False, max_checks=150, quota=DAILY_QUOTA):
    posted = timviecso.list_jobs()
    on_site = {m for j in posted for line in j.get("description") or [] for m in JOB_LINK.findall(line)}
    counts, columns = {}, {}
    for j in posted:
        counts[j.get("location")] = counts.get(j.get("location"), 0) + 1
        columns[kind_of(j)] = columns.get(kind_of(j), 0) + 1
    today = posted_today(posted, datetime.now(VN).date())
    found = {}  # nhãn khu vực hoặc loại hình -> {mã tin: (link, mã tỉnh hoặc None)}, chỉ quét khi cần
    allowed = {loc for r in REGIONS for loc in r[1]}
    checks, results, skipped = 0, [], []
    exhausted = set()  # loại hình không còn tin mới đạt trong lượt này

    def candidates(key):
        if key not in found:
            found[key] = {}
            if key in KEYWORDS:
                for kw in KEYWORDS[key]:
                    try:
                        for job_id, link in search_ids(kw).items():
                            found[key].setdefault(job_id, (link, None))
                    except requests.RequestException as exc:
                        print(f"Bỏ qua từ khóa {kw}: {exc}", file=sys.stderr)
            else:
                for loc in next(r[1] for r in REGIONS if r[0] == key):
                    try:
                        for job_id, link in list_ids(loc).items():
                            found[key].setdefault(job_id, (link, loc))
                    except requests.RequestException as exc:
                        print(f"Bỏ qua tỉnh {loc}: {exc}", file=sys.stderr)
        # Mã tin CareerViet tăng dần theo thời gian đăng: mã lớn là tin mới.
        return sorted((i for i in found[key] if i not in on_site), key=lambda i: int(i, 16), reverse=True)

    def try_post(key, want=None):
        """Đăng tin mới nhất đạt yêu cầu trong nhóm key; want là loại hình bắt buộc (None = bất kỳ)."""
        nonlocal checks
        for job_id in candidates(key):
            if checks >= max_checks:
                return False
            checks += 1
            link, loc = found[key][job_id]
            try:
                d = detail(job_id)
                if want and work_type(d) != want:
                    continue  # tìm theo từ khóa ra cả tin loại khác: để dành cho lượt của loại đó
                on_site.add(job_id)
                loc = loc or d.get("location_id")
                if loc not in allowed:
                    skipped.append({"link": link, "ly_do": f"ngoài khu vực ({d.get('location_name_vn')})"})
                    continue
                job, reason = to_job(d, link, loc)
            except (requests.RequestException, ValueError) as exc:
                job, reason = None, f"lỗi đọc tin: {exc}"
            if not job:
                skipped.append({"link": link, "ly_do": reason})
                continue
            res = timviecso.post_jobs([job], dry_run=dry_run)[0]
            results.append({**res, "khu_vuc": job["location"], "loai_hinh": job["workType"]})
            if res["status"] in ("da_dang", "thu"):
                counts[job["location"]] = counts.get(job["location"], 0) + 1
                columns[job["workType"]] = columns.get(job["workType"], 0) + 1
                today[job["workType"]] = today.get(job["workType"], 0) + 1
                return True
        return False

    for _ in range(max_posts):
        # Thực tập, bán thời gian chưa đủ hạn mức hôm nay: loại nào còn thiếu nhiều hơn thì trước.
        short = sorted((k for k in KEYWORDS if today.get(k, 0) < quota and k not in exhausted),
                       key=lambda k: (today.get(k, 0), columns.get(k, 0), list(KEYWORDS).index(k)))
        posted_one = False
        for kind in short:
            if try_post(kind, want=kind):
                posted_one = True
                break
            exhausted.add(kind)
        if not posted_one:
            for label, _locs, _w in region_order(counts):
                if try_post(label):
                    posted_one = True
                    break
        if not posted_one:
            break
    return {"tin_tren_trang": counts, "theo_loai_hinh": columns, "dang_hom_nay": today,
            "ket_qua": results, "bo_qua": skipped}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--max", type=int, default=2, help="Số tin đăng tối đa mỗi lượt (mặc định 2)")
    p.add_argument("--quota", type=int, default=DAILY_QUOTA,
                   help=f"Số tin Thực tập và số tin Bán thời gian cần đăng mỗi ngày (mặc định {DAILY_QUOTA}, 0 = bỏ)")
    p.add_argument("--dry-run", action="store_true", help="Chỉ in tin sẽ đăng, không đăng")
    p.add_argument("--loop-minutes", type=float, default=0, help="Chạy lặp trong bấy nhiêu phút (0 = quét một lần)")
    p.add_argument("--every", type=float, default=5, help="Khoảng cách giữa các lượt quét, phút")
    args = p.parse_args(argv)
    end = time.monotonic() + args.loop_minutes * 60
    errors = 0
    while True:
        start = time.monotonic()
        try:
            report = scan(args.max, dry_run=args.dry_run, quota=args.quota)
        except Exception as exc:  # một lượt lỗi (mạng, trang đổi) không được dừng cả vòng lặp
            report = {"loi": str(exc), "ket_qua": []}
        errors += sum(r["status"] == "loi" for r in report["ket_qua"]) + ("loi" in report)
        print(datetime.now().strftime("%H:%M:%S"), json.dumps(report, ensure_ascii=False), flush=True)
        wait = args.every * 60 - (time.monotonic() - start)
        if time.monotonic() + wait >= end:
            break
        time.sleep(max(0, wait))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
