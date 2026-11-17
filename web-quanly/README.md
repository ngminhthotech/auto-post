# Website bảng điều khiển Auto Post

Website riêng chạy trên Cloudflare Workers (gói miễn phí): xem lịch chạy, bài đã đăng kèm link và lượt xem, số liệu, duyệt và gỡ tin timviecso.vn.

| Phần | Cách làm |
| --- | --- |
| Đăng nhập | Mật khẩu (`PASSWORD`, phiên 14 ngày, khóa 15 phút sau 10 lần sai). Có thể bật thêm Cloudflare Access (mã gửi về email) ở bước 5. |
| Bài đã đăng, lượt xem | Gọi thẳng Buffer GraphQL bằng `BUFFER_API_KEY` |
| Tin, video timviecso.vn | Gọi thẳng `api.timviecso.vn`; nút Gỡ xóa tin ngay |
| Duyệt, nhật ký gỡ | Kho KV của Cloudflare |
| Lịch chạy | Chỉ hiển thị (các tác vụ chạy trong Claude); đổi giờ trên bảng điều khiển Claude |

Số liệu được giữ 5 phút; nút "Cập nhật số liệu" lấy mới ngay.

## Cài đặt lần đầu

1. Tạo tài khoản miễn phí ở https://dash.cloudflare.com/sign-up.
2. Cài và đăng nhập (trên máy có Node.js 20+), trong thư mục `web-quanly/`:
   ```bash
   npm install
   npx wrangler login
   ```
   Hoặc tạo API token (mẫu "Edit Cloudflare Workers") và đặt biến `CLOUDFLARE_API_TOKEN`.
3. Tạo kho KV rồi chép `id` in ra vào `wrangler.toml` (dòng `id = "THAY_BANG_ID_KHO_KV"`):
   ```bash
   npx wrangler kv namespace create autopost-quanly
   ```
4. Đặt bí mật và đưa website lên:
   ```bash
   npx wrangler secret put PASSWORD
   npx wrangler secret put BUFFER_API_KEY
   npx wrangler deploy
   ```
   Website ở địa chỉ `https://autopost-quanly.<tên-tài-khoản>.workers.dev`.
5. (Tùy chọn, an toàn hơn) Bật Cloudflare Access: trong Cloudflare, Workers & Pages > autopost-quanly > Settings > Domains & Routes, bật Cloudflare Access cho địa chỉ workers.dev, thêm email được vào. Ghi tên nhóm Zero Trust vào `ACCESS_TEAM`, mã AUD của ứng dụng vào `ACCESS_AUD`, email vào `ALLOWED_EMAILS` trong `wrangler.toml`, rồi `npx wrangler deploy` lại. Khi đã có `ACCESS_AUD`, website bỏ đăng nhập bằng mật khẩu và chỉ nhận người đã qua Access.

## Chạy thử trên máy

```bash
printf 'PASSWORD=thu-nghiem\nBUFFER_API_KEY=<khóa>\n' > .dev.vars
npx wrangler dev
```

Mở http://localhost:8787. Nút Gỡ khi chạy thử vẫn gỡ tin thật trên timviecso.vn.
