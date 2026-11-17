# Auto Post - Tìm Việc Số

Tự động tìm tin tuyển dụng ở Cần Thơ, ĐBSCL và TP.HCM, dựng bài và đăng lên Facebook Fanpage, TikTok, YouTube Shorts lúc 8:00 và 14:00 (giờ Việt Nam).

Đường đăng chính: **Buffer** (`autopost/buffer.py`), ảnh/video lấy URL công khai từ nhánh `media` (`autopost/media.py`). Các module `facebook`, `youtube`, `make` là phương án dự phòng.

Dữ liệu và lịch đăng nằm trên Google Drive, thư mục **Auto Post** (sheet `Lich dang`, file quy tắc trong `00_Thuong hieu`).

## Cấu trúc

| Đường dẫn | Việc |
| --- | --- |
| `autopost/buffer.py` | Đăng lên Facebook, TikTok, YouTube qua Buffer GraphQL API |
| `autopost/media.py` | Đưa ảnh/video lên nhánh `media` để có URL công khai |
| `autopost/facebook.py` | Đăng ảnh, Reels, bình luận lên Fanpage qua Graph API |
| `autopost/make.py` | Gửi bài sang kịch bản Make.com để đăng Facebook (dùng thay Graph API) |
| `autopost/youtube.py` | Tải video Shorts lên YouTube qua YouTube Data API v3 |
| `render/bangtin.js` | Mẫu thương hiệu D24: ảnh Facebook 1080x1350 và các khung video 1080x1920 từ JSON |
| `render/render.js` | Mẫu cũ (dự phòng) |
| `assets/logo-d24.png` | Logo D24 nền trong suốt |
| `render/make_video.sh` | Ghép khung thành video MP4 dọc |
| `examples/sample-data.json` | Dữ liệu mẫu (7 tin thật ngày 26/10/2026) |
| `ROUTINE.md` | Hướng dẫn cho routine soạn bài và đăng bài |
| `autopost/dashboard.py` | Gom số liệu cho bảng điều khiển (`snapshot`) và gỡ tin theo yêu cầu từ bảng điều khiển (`go`) |
| `dashboard/index.html` | Mã nguồn trang bảng điều khiển riêng trên claude.ai |
| `web-quanly/` | Website bảng điều khiển riêng trên Cloudflare (đăng nhập, gọi Buffer và timviecso.vn trực tiếp), xem `web-quanly/README.md` |

## Biến môi trường

Đặt trong môi trường cloud của Claude (không commit vào repo):

| Biến | Ý nghĩa |
| --- | --- |
| `BUFFER_API_KEY` | Khóa API Buffer. Trên Claude nên lưu thành Network secret (host `api.buffer.com`, header `Authorization: Bearer <khóa>`) thay vì biến này |
| `FB_PAGE_ID` | ID Fanpage |
| `FB_PAGE_TOKEN` | Page Access Token dài hạn, quyền `pages_manage_posts` |
| `MAKE_WEBHOOK_URL` | Webhook kịch bản Make đăng Facebook (bí mật) |
| `YT_CLIENT_ID`, `YT_CLIENT_SECRET` | OAuth client của dự án Google Cloud |
| `YT_REFRESH_TOKEN` | Refresh token có quyền `youtube.upload` |

## Chạy thử

```bash
pip install -r requirements.txt
python -m autopost.facebook check
node render/bangtin.js examples/bangtin-mau.json out/
render/make_video.sh out/ out/post2_video.mp4
python -m autopost.facebook photo --image out/post1_facebook.png --caption-file caption.txt --draft
```

`--draft` tạo bài ẩn (ảnh) hoặc bản nháp (Reels), không hiện công khai.

## Bảng điều khiển

Trang riêng trên claude.ai (chỉ chủ dự án mở được, đăng nhập bằng tài khoản Claude): https://claude.ai/artifact/8X8Q9SMXaf8TnAnhdmLEEW. Mã nguồn `dashboard/index.html`; sửa xong thì xuất bản lại vào đúng link đó.

- **Tổng quan, Bài đã đăng, Tin timviecso.vn, Nhật ký**: đọc `/mnt/project-files/auto-post/dashboard/snapshot.json` do `python3 -m autopost.dashboard snapshot` ghi.
- **Lịch chạy**: đọc và đổi giờ, bật/tắt các tác vụ Claude của dự án qua kết nối Claude Code Remote (đổi thật, áp dụng từ lượt kế tiếp).
- **Duyệt**: đánh dấu tin đã kiểm tra, lưu trong dữ liệu của trang.
- **Gỡ**: trang gọi tác vụ "Auto Post - Bảng điều khiển (cập nhật số liệu, gỡ tin)" kèm danh sách mã tin; tác vụ chạy `python3 -m autopost.dashboard go <id...> --reason "..."`, ghi `dashboard/nhat-ky-go.json` rồi cập nhật snapshot.
- Tác vụ đó cũng tự cập nhật số liệu lúc 12:47 và 21:47 mỗi ngày; nút "Cập nhật số liệu" trên trang chạy nó ngay.
