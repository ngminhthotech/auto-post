"""Số liệu hiện trong khung ghi công ở cảnh mở đầu (người dẫn), canh đúng lúc người dẫn đọc tới từng số.

Lấy số từ câu mở đầu (voice[0]["say"], lời đọc thật do render/voice.py ghi), rồi ước thời điểm đọc tới:
tìm các đoạn có tiếng trong file giọng (ffmpeg silencedetect), coi mỗi âm tiết dài như nhau trên phần có tiếng,
và đặt số tại âm tiết đầu của nó. Sai lệch thường dưới nửa giây.

  python3 render/pops.py props.json      # in danh sách số liệu và thời điểm (giây)
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "video" / "public"
LEAD = 0.35  # hiện sớm hơn một chút để số bật ra đúng lúc vừa nghe tới

# (mẫu trong lời đọc, nhãn, dòng mô tả, biểu tượng, màu)
ITEMS = [
    (r"(\d+) việc làm bán thời gian", "BÁN THỜI GIAN", "Tại Cần Thơ, cho sinh viên", "grad", "#FF7F14"),
    (r"(\d+) việc làm toàn thời gian", "TOÀN THỜI GIAN", "Tổng: Cần Thơ, Miền Tây, TP.HCM", "briefcase", "#1E7BFF"),
    (r"(\d+) tại Cần Thơ", "CẦN THƠ", "Việc làm toàn thời gian", "pin", "#00B4D8"),
    (r"(\d+) tại Đồng bằng sông Cửu Long", "MIỀN TÂY", "Đồng bằng sông Cửu Long", "pin", "#22B04B"),
    (r"(\d+) tại Thành [Pp]hố Hồ Chí Minh", "TP. HỒ CHÍ MINH", "Việc làm toàn thời gian", "pin", "#E5252A"),
]

DIGITS = "không một hai ba bốn năm sáu bảy tám chín".split()


def number_syllables(n):
    """Số âm tiết khi đọc số tiếng Việt (gần đúng, đủ để canh giờ)."""
    if n < 10:
        return 1
    if n < 100:
        tens, unit = divmod(n, 10)
        return (1 if tens == 1 else 2) + (1 if unit else 0)
    if n < 1000:
        h, r = divmod(n, 100)
        return 2 + (0 if r == 0 else 2 if r < 10 else number_syllables(r))
    th, r = divmod(n, 1000)
    rest = 0 if r == 0 else (2 + number_syllables(r) if r < 100 else number_syllables(r))
    return number_syllables(th) + 1 + rest


def tokens(text):
    """Danh sách (vị trí ký tự, số âm tiết) của từng từ trong câu."""
    out = []
    for m in re.finditer(r"\d+|[^\W\d_]+", text):
        w = m.group(0)
        out.append((m.start(), number_syllables(int(w)) if w.isdigit() else 1))
    return out


def speech_segments(path, noise="-35dB", gap=0.12):
    """Các đoạn có tiếng [(bắt đầu, kết thúc)] trong file âm thanh."""
    r = subprocess.run(["ffmpeg", "-i", str(path), "-af", f"silencedetect=n={noise}:d={gap}", "-f", "null", "-"],
                       capture_output=True, text=True)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]))
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    segs, t = [], 0.0
    for s, e in zip(starts, ends + [dur]):
        if s > t:
            segs.append((t, s))
        t = e
    if t < dur:
        segs.append((t, dur))
    return [(a, b) for a, b in segs if b - a > 0.05]


def time_at(frac, segs):
    """Thời điểm (giây) ứng với tỉ lệ frac của tổng thời gian có tiếng."""
    total = sum(b - a for a, b in segs)
    left = frac * total
    for a, b in segs:
        if left <= b - a:
            return a + left
        left -= b - a
    return segs[-1][1] if segs else 0.0


def compute(data):
    v = (data.get("voice") or [None])[0]
    if not v:
        return []
    say = v.get("say") or v.get("text") or ""
    toks = tokens(say)
    total = sum(n for _, n in toks)
    segs = speech_segments(PUBLIC / v["src"])
    if not total or not segs:
        return []
    pops = []
    for pat, kicker, label, icon, color in ITEMS:
        m = re.search(pat, say)
        if not m:
            continue
        before = sum(n for pos, n in toks if pos < m.start(1))
        pops.append({"at": round(max(0.0, time_at(before / total, segs) - LEAD), 2), "value": int(m.group(1)),
                     "kicker": kicker, "label": label, "icon": icon, "color": color})
    return pops


if __name__ == "__main__":
    d = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    print(json.dumps(compute(d), ensure_ascii=False, indent=1))
