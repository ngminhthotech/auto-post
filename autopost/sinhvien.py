"""Gom tin việc làm bán thời gian ở Cần Thơ cho phần sinh viên của bản tin video.

Nguồn đọc tự động được (đã thử 01/11/2026):
- vieclamcantho.com.vn: mục Bán thời gian (type=2) và Thực tập (type=3).
- vieclam24h.vn: toàn bộ tin Cần Thơ, lọc theo tên vị trí.
TopCV, JobsGO, Indeed chặn máy chủ (403); jobsnew.vn, CareerViet tải danh sách bằng JavaScript.

Chạy:
    python3 -m autopost.sinhvien --out out/sinhvien.json
In ra số tin theo nhóm và ghi danh sách ứng viên (chưa phải bangtin.json). Người soạn vẫn phải
mở tin gốc để kiểm tra, rồi chọn tối đa 6 tin mỗi nhóm cho `freelance.groups`.
"""
import argparse
import datetime as dt
import html
import json
import re
import sys

import requests

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
VLCT = "https://vieclamcantho.com.vn/viec-lam?ts=1&type={type}&page={page}"
V24 = "https://vieclam24h.vn/viec-lam-can-tho-p131.html?page={page}"
V24_CANTHO = 210000192

# Tên vị trí cho thấy việc hợp sinh viên
STUDENT = re.compile(r"thực tập|thuc tap|\btts\b|intern|học việc|part[\s-]?time|bán thời gian|theo ca|ca tối|ca sáng|"
                     r"thời vụ|cộng tác|\bctv\b|trợ giảng|sinh viên|làm thêm|freelance|tại nhà|online|remote", re.I)
# Bỏ: ăn hoa hồng tài chính, thu nợ, bất động sản, đòi tiền
EXCLUDE = re.compile(r"bảo hiểm|thẻ tín dụng|mở thẻ|cho vay|vay tiêu dùng|tài chính|trả góp|thu hồi nợ|đòi nợ|"
                     r"bất động sản|\bbđs\b|chứng khoán|đặt cọc|phí hồ sơ|nạp tiền|làm nhiệm vụ|tuyển dụng toàn quốc", re.I)


def kind(pos):
    p = pos.lower()
    if re.search(r"thực tập|thuc tap|\btts\b|intern|học việc", p):
        return "Thực tập"
    if re.search(r"cộng tác|\bctv\b|tại nhà|online|remote|freelance", p):
        return "Cộng tác viên"
    return "Part-time"


def _get(url):
    r = requests.get(url, headers=UA, timeout=40)
    r.raise_for_status()
    return r.text


def vieclamcantho(pages=3):
    out = []
    for typ, label in ((2, "Bán thời gian"), (3, "Thực tập")):
        for page in range(1, pages + 1):
            try:
                t = re.sub(r"\s+", " ", _get(VLCT.format(type=typ, page=page)))
            except Exception as e:  # noqa: BLE001
                print(f"vieclamcantho type={typ} page={page}: {e}", file=sys.stderr)
                break
            found = 0
            for blk in t.split('class="list-group-item')[1:]:
                m = re.search(r'href="(https://vieclamcantho.com.vn/[^"]+)" class="fw-600[^>]*title="([^"]+)"', blk)
                if not m:
                    continue
                found += 1
                co = re.search(r'boxItemAddress[^>]*title="([^"]+)"', blk)
                g = lambda k: html.unescape((re.search(k + r': ([^"]+)"', blk) or [None, ""])[1])  # noqa: E731
                logo = re.search(r'data-src="([^"]+)"', blk)
                out.append(dict(pos=html.unescape(m[2]), co=html.unescape(co[1]) if co else "", sal=g("Mức lương"),
                                area=g("Khu vực"), dl=g("Hạn nộp"), link=m[1], logo=logo[1] if logo else "",
                                src="vieclamcantho.com.vn", section=label))
            if not found:
                break
    return out


def _money(a, b):
    f = lambda x: f"{x / 1e6:g}".replace(".", ",")  # noqa: E731
    if a and b:
        return f"{f(a)}–{f(b)} triệu"
    if b:
        return f"đến {f(b)} triệu"
    if a:
        return f"từ {f(a)} triệu"
    return "Thỏa thuận"


def vieclam24h(max_pages=10):
    out = []
    for page in range(1, max_pages + 1):
        try:
            t = _get(V24.format(page=page))
            d = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', t, re.S)[1])
            res = d["props"]["initialProps"]["pageProps"]["jobsResponse"]
        except Exception as e:  # noqa: BLE001
            print(f"vieclam24h page={page}: {e}", file=sys.stderr)
            break
        for j in res["items"]:
            e = j.get("employer_info") or {}
            exp = j.get("resume_apply_expired")
            occ = (j.get("occupation_ids_main") or [0])[0]
            provs = j.get("province_ids") or []
            out.append(dict(
                pos=j["title"].strip(), co=(e.get("name") or "").strip(), sal=_money(j.get("salary_min"), j.get("salary_max")),
                area="Cần Thơ" if provs[:1] == [V24_CANTHO] else ("Cần Thơ và tỉnh khác" if V24_CANTHO in provs else "Khác"),
                dl=dt.datetime.fromtimestamp(exp, dt.timezone(dt.timedelta(hours=7))).strftime("%d/%m/%Y") if exp else "",
                link=f"https://vieclam24h.vn/viec-lam/{j['title_slug']}-c{occ}p{V24_CANTHO}id{j['id']}.html",
                logo=e.get("logo") or "", src="vieclam24h.vn", section="",
                multi=len(provs) > 2))
        if page >= res.get("last", page):
            break
    return out


def collect(today=None):
    today = today or dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).date()
    raw = vieclamcantho() + vieclam24h()
    keep, seen, dropped = [], set(), []
    for j in raw:
        pos = j["pos"]
        why = None
        try:
            dl = dt.datetime.strptime(j["dl"], "%d/%m/%Y").date() if j["dl"] else None
        except ValueError:
            dl = None
        if "Cần Thơ" not in j["area"]:
            why = "không ở Cần Thơ"
        elif j.get("multi"):
            why = "tin đăng chung nhiều tỉnh"
        elif dl and dl < today:
            why = "hết hạn"
        elif not j["co"]:
            why = "không có tên công ty"
        elif EXCLUDE.search(pos) or EXCLUDE.search(j["co"]) or re.search(r"nhân thọ|prudential|manulife|aia\b", j["co"], re.I):
            why = "tài chính, bảo hiểm, ăn hoa hồng hoặc đòi phí"
        elif not (j["section"] or STUDENT.search(pos)):
            why = "không phải việc cho sinh viên"
        key = (re.sub(r"\W+", "", pos.lower()), re.sub(r"\W+", "", j["co"].lower()))
        if not why and key in seen:
            why = "trùng"
        if why:
            dropped.append({**j, "why": why})
            continue
        seen.add(key)
        j["tag"] = "Thực tập" if j["section"] == "Thực tập" else kind(pos)
        keep.append(j)
    keep.sort(key=lambda j: (j["tag"], dt.datetime.strptime(j["dl"], "%d/%m/%Y") if j["dl"] else dt.datetime.max))
    return keep, dropped


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default="out/sinhvien.json")
    a = ap.parse_args()
    keep, dropped = collect()
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"jobs": keep, "dropped": dropped}, f, ensure_ascii=False, indent=1)
    by = {}
    for j in keep:
        by.setdefault(j["tag"], []).append(j)
    for tag, js in by.items():
        print(f"== {tag}: {len(js)} tin")
        for j in js:
            print(f"  {j['pos'][:60]} | {j['co'][:45]} | {j['sal']} | hạn {j['dl']} | {j['link']}")
    print(f"Tổng {len(keep)} tin giữ, {len(dropped)} tin bỏ. Ghi {a.out}")


if __name__ == "__main__":
    main()
