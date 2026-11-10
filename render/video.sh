#!/usr/bin/env bash
# Dựng video động thương hiệu D24 (Remotion, mẫu BangTinPro; COMP=BangTin để dùng mẫu cũ) từ JSON bảng tin, có nhạc nền, chuẩn âm lượng -14 LUFS.
# Cách dùng: render/video.sh examples/bangtin-mau.json out/video.mp4 [--voice]
#   --voice: thêm giọng đọc Vbee (cần khóa Vbee trong môi trường, xem render/voice.py)
#   render/video.sh <json> out/video.mp4 --voice --presenter: người dẫn Topview (Network secret api.topview.ai), lỗi thì ảnh tĩnh
#   PRESENTER=1 render/video.sh ... --voice: mở đầu bằng người dẫn chương trình nói từ ảnh assets/nguoi-dan.jpg (render/presenter.py)
set -euo pipefail
json="$(realpath "$1")"; out="$(realpath -m "$2")"; voice="${3:-}"
# --presenter (tham số thứ 4): người dẫn Topview tự động, lỗi thì ảnh tĩnh (dùng cho routine 7:00)
[ "${4:-}" = "--presenter" ] && PRESENTER=auto
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/video"
[ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null
[ -f public/music.wav ] || python3 "$root/render/music.py" public/ >/dev/null
tmp="$(mktemp -d)"
if [ "$voice" = "--voice" ]; then
  style=pro; [ "${COMP:-BangTinPro}" = "BangTin" ] && style=basic
  python3 "$root/render/voice.py" "$json" --style "$style" --out "$tmp/props.json" >/dev/null
  json="$tmp/props.json"
  # Người dẫn chương trình ở cảnh mở đầu: PRESENTER=1 (Topview API nếu có TOPVIEW_API_KEY, không thì fal.ai), PRESENTER=<file.mp4> (video làm tay trên Topview) hoặc PRESENTER=still (ảnh tĩnh)
  case "${PRESENTER:-}" in
    1) python3 "$root/render/presenter.py" "$json" >/dev/null ;;
    still) python3 "$root/render/presenter.py" "$json" --still >/dev/null ;;
    auto) python3 "$root/render/presenter.py" "$json" --auto >/dev/null ;;
    *.mp4) python3 "$root/render/presenter.py" "$json" --video "$(realpath -m "$PRESENTER")" >/dev/null ;;
  esac
fi
if [ "${COMP:-BangTinPro}" = "BangTinPro" ]; then
  # Tư liệu thật: logo/ảnh bìa nhà tuyển dụng (tin có "id" CareerViet) và cảnh quay nền (BROLL_SET=1 hoặc 2)
  [ "$json" = "$tmp/props.json" ] || { cp "$json" "$tmp/props.json"; json="$tmp/props.json"; }
  python3 "$root/render/tulieu.py" logo "$json" || echo "Bỏ qua logo: lỗi tải" >&2
  python3 "$root/render/tulieu.py" broll "$json" --set "${BROLL_SET:-1}" || echo "Bỏ qua cảnh quay nền: lỗi tải" >&2
fi
npx remotion render "${COMP:-BangTinPro}" "$tmp/raw.mp4" --props="$json" --codec=h264 --crf=20 --log=error
ffmpeg -y -loglevel error -i "$tmp/raw.mp4" -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:a aac -b:a 192k -movflags +faststart "$out"
rm -rf "$tmp"
echo "$out"
