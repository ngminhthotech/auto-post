# Hướng dẫn cho routine

## Routine bản tin video (7:00 mỗi sáng, luồng chuẩn từ 02/11/2026)

> **TẠM DỪNG TIKTOK (chủ dự án chọn ngày 06/11/2026):** nếu hôm nay (giờ Việt Nam) là ngày 06, 07, 08 hoặc 09/11/2026 thì KHÔNG dựng bản TikTok và KHÔNG đăng TikTok, chỉ đăng Facebook và YouTube. Báo cáo ghi "TikTok tạm dừng đến hết 09/11 (chờ kháng nghị)"; đây không phải lỗi, không mở đầu bằng "⚠️ CẦN XỬ LÝ" vì lý do này. Từ 10/11/2026 bỏ qua đoạn này và đăng TikTok bình thường.

Một video bản tin mỗi ngày, đăng 7:00 (giờ Việt Nam) lên Facebook, TikTok @timviecso.vn và YouTube qua Buffer (id kênh trong `channels.json`). Bản mẫu chuẩn: `/mnt/project-files/auto-post/bai-2026-11-01-1706/` (video, `bangtin.json`, chú thích).

Thứ tự video (không đảo, không trộn vùng): mở đầu sinh viên → tổng quan việc làm bán thời gian Cần Thơ → Thực tập → Part-time theo ca → Cộng tác viên → việc làm toàn thời gian Cần Thơ → Đồng bằng sông Cửu Long → TP. Hồ Chí Minh → làm thêm an toàn → ứng tuyển thế nào → kết. Không có cảnh lương cao nhất, nhà tuyển dụng, ngành, sắp hết hạn (các cảnh này trộn nhiều vùng).

1. Việc làm bán thời gian Cần Thơ (phần chính): `python3 -m autopost.sinhvien --out out/sinhvien.json` gom tin từ vieclamcantho.com.vn (mục Bán thời gian, Thực tập) và vieclam24h.vn (tin Cần Thơ), đã bỏ tin hết hạn, ngoài Cần Thơ, đăng chung nhiều tỉnh, bảo hiểm, tài chính, trả góp, bất động sản, đòi phí. Mở tin gốc của các tin định đưa lên video để kiểm tra. Ghi `freelance` theo bản mẫu: `name` "Việc làm bán thời gian Cần Thơ", `label` "VIỆC LÀM BÁN THỜI GIAN", `say` "việc làm bán thời gian tại Cần Thơ", `place` "Cần Thơ", `total`, `stats` (số tin từng nhóm), `payNote`, 3 `groups` (Thực tập, Part-time theo ca, Cộng tác viên), mỗi nhóm tối đa 6 tin có `tag`, `area` "Cần Thơ", `note` (ca làm, phụ cấp, yêu cầu ngắn), và 4 `tips` an toàn. Tất cả việc bán thời gian đều phải ở Cần Thơ.
2. Việc làm toàn thời gian (khoảng 20 tin mới, còn hạn trên CareerViet, `autopost/careerviet.py`): danh sách CẦN THƠ, ô miền Tây (tối đa 4 tỉnh ĐBSCL), danh sách TP. HỒ CHÍ MINH; `sub` của danh sách và ô ghi "Việc làm toàn thời gian". Bỏ tin công ty ẩn danh, thu phí, sai khu vực. Mỗi tin có `id` CareerViet, `co` ghi đủ loại hình công ty.
3. `python3 render/voice.py <json> --dry-run` rồi `render/video.sh <json> out/video.mp4 --voice`. Lời đọc: mở đầu "Xin chào bạn, đến với bản tin Tìm Việc Số, được cập nhật liên tục 24/7. Dự án này được nghiên cứu và phát triển tại Học viện Design24. Hôm nay, ngày D, tháng M, năm Y, ..." (chỉ nói ngày, không nói giờ, đọc liền một lượt); vùng đọc theo thứ tự "Việc làm toàn thời gian tại Cần Thơ", "Tiếp theo, Đồng bằng sông Cửu Long", "Cuối cùng, Thành phố Hồ Chí Minh". Ứng dụng chỉ nói một lần ở câu kết: "Ứng dụng Tìm Việc Số đã có trên Android và iOS" (để nguyên chữ, không phiên âm; không nói "CH Play", "App Store"). Video dài 90 đến 180 giây (YouTube Shorts tối đa 180 giây). Video không có mã QR, số điện thoại, email trên hình, lời đọc không đọc số điện thoại. Xem khung hình từng cảnh trước khi đăng.
4. Nén: bản chính `-crf 28 -maxrate 1.0M`; bản TikTok `-crf 30 -maxrate 0.7M`. Tải lên bằng `python3 -m autopost.media <file...> --folder <ngày>`.
5. Chú thích theo bản mẫu: Facebook liệt kê việc bán thời gian Cần Thơ theo nhóm trước, rồi "Làm thêm an toàn", rồi việc toàn thời gian theo thứ tự Cần Thơ, Miền Tây, TP.HCM, cách ứng tuyển, khối liên hệ dạng chữ, nguồn, hashtag. TikTok không có số điện thoại, đường link hay lời mời nhắn Zalo, chỉ ghi "timviecso.vn hoặc app Tìm Việc Số trên Android và iOS" và 4 đến 6 hashtag. Không viết "quét mã QR". TikTok (từ 06/11/2026, sau khi nhiều video bị gắn "Vi phạm Nguyên tắc Cộng đồng"): trường `cta` trong JSON không dùng "Inbox", "nhắn tin", "link" (dùng "Xem chi tiết tại timviecso.vn"); không dùng hashtag #vieclamthem #parttime #kiemtienonline; bài TikTok luôn gắn nhãn AI (`isAiGenerated`, `autopost.buffer` tự thêm).
6. Đăng (hẹn `--at` 7:00 nếu còn kịp, không thì đăng ngay): Facebook dùng `--metadata '{"facebook":{"type":"post"}}'` (Reels chỉ nhận ≤90 giây); TikTok `--service tiktok --title`; YouTube `--service youtube --title "... #Shorts"`.
7. Lưu bài vào `/mnt/project-files/auto-post/bai-<ngày>-0700/`; ghi dòng mới vào tab `Lich dang` của sheet "Lich dang" (id, link, trạng thái). Kênh lỗi: ghi lỗi, không đăng lại quá 2 lần.

## Routine soạn bài (20:00 mỗi tối)

1. Đọc file quy tắc `00_Thuong hieu/Quy tac noi dung tuyen dung` trên Drive. Quy tắc trong file đó luôn được ưu tiên.
2. Kiểm tra thư mục `01_Yeu cau rieng`: có yêu cầu mới thì làm yêu cầu đó trước.
3. Tìm tin tuyển dụng mới ở Cần Thơ, các tỉnh ĐBSCL và TP.HCM. Mở từng tin gốc, chỉ giữ tin còn hạn, có tên công ty, có cách ứng tuyển và không có dấu hiệu lừa đảo.
4. Bỏ tin đã có trong tab `Tin tuyen dung` (trùng link gốc) hoặc đã đăng trong 14 ngày.
5. Ghi tin đạt vào tab `Tin tuyen dung`.
6. Dùng mẫu thương hiệu D24 "Bảng tin tuyển dụng tổng hợp". Mỗi bài tạo một JSON theo `examples/bangtin-mau.json` (tên vị trí dưới khoảng 26 ký tự, mỗi danh sách tối đa 6 tin, ô ĐBSCL tối đa 4 tỉnh). Ảnh: `node render/bangtin.js <json> out/` (dùng `out/bangtin.png`). Video động có nhạc nền: `render/video.sh <json> out/video.mp4 --voice` (Remotion). Trường `co` ghi rõ loại hình công ty (vd. Công ty TNHH ..., Công ty CP ..., Ngân hàng TMCP ...). Thứ tự trong video: Cần Thơ, các tỉnh ĐBSCL, rồi TP.HCM. Mỗi tin nên có trường `id` là mã tin CareerViet để video tự lấy logo và ảnh bìa công ty; cảnh quay nền tự tải từ Mixkit (`BROLL_SET=2` cho bài thứ hai trong ngày). Video không dùng bản đồ, dài ít nhất 90 giây (yêu cầu của chủ dự án), có đủ TP.HCM, cảnh sắp hết hạn nộp, cách ứng tuyển (chọn việc, rồi liên hệ nhà tuyển dụng HOẶC timviecso.vn/app). Không có mã QR, số điện thoại hay email trên hình (TikTok và các mạng xã hội hay giảm hiển thị video có những thứ này); cảnh kết chỉ ghi timviecso.vn và app Tìm Việc Số. Facebook Reels chỉ nhận ≤90 giây nên bài Facebook đăng dạng video thường (metadata facebook type "post"). TikTok dùng bản nén nhẹ (khoảng 13 MB). Bài 8:00 dùng ảnh; bài 14:00 dùng video với nhóm tin khác bài 8:00. Xem lại ảnh và vài khung video trước khi dùng. Thông tin liên hệ lấy từ `assets/brand.json`, không tự sửa.
7. Caption theo mẫu `examples/bai-mau-d24/`: Facebook có danh sách tin theo khu vực, khối liên hệ (hotline, Zalo, timviecso.vn, design24.vn, email), cảnh báo không thu phí và 10 đến 15 hashtag; TikTok 2 đến 3 câu kèm khoảng 10 hashtag; YouTube tiêu đề dưới 100 ký tự có #Shorts, mô tả có liên hệ và nguồn.
8. Tải ảnh, video, caption lên `03_Cho dang/<ngày>_<giờ>_<chủ đề>/` và thêm 2 dòng vào tab `Lich dang` với trạng thái `Cho dang`.

## Routine đăng bài (8:00 và 14:00)

1. Lấy dòng `Lich dang` đúng ngày và khung giờ, trạng thái `Cho dang`.
2. Tải file từ thư mục bài trên Drive.
3. Chạy `python -m autopost.media <file...> --folder <ngày>` để lấy URL công khai.
4. Lấy id kênh trong `channels.json` (kiểm tra lại bằng `python -m autopost.buffer channels` nếu đăng lỗi).
5. Đăng ngay qua Buffer cho từng kênh, luôn kèm `--service <mạng>`:
   - 8:00: Facebook, `--image-url`.
   - 14:00: TikTok và YouTube với `--video-url --title "<tiêu đề>"`; Facebook với `--video-url` (tự đăng dạng Reels).
6. Ghi id/link bài vào `Lich dang`, đổi trạng thái thành `Da dang`, chuyển thư mục bài sang `05_Da dang`, ghi giờ đăng vào tab `Tin tuyen dung`.
7. Kênh lỗi: ghi lỗi vào cột `Ghi chu / loi`, gửi email báo chủ Trang, không đăng lại quá 2 lần.

## Đăng timviecso.vn

### Đăng tự động khoảng 2 giờ một tin

Tác vụ Claude "Đăng timviecso.vn (2 giờ 1 tin)" chạy `python3 -m autopost.careerviet --max 1` mỗi 2 giờ (`.github/workflows/quet-tin.yml` chỉ để chạy tay): lấy tin mới nhất trên CareerViet có nơi làm việc chính ở Cần Thơ, ĐBSCL hoặc TP.HCM, chọn khu vực đang thiếu nhất trên trang theo tỉ lệ Cần Thơ 4 : ĐBSCL 3 : TP.HCM 2 (hòa thì ưu tiên Cần Thơ, rồi ĐBSCL; khu vực thiếu không có tin mới thì lấy khu vực kế), lọc cố định (còn hạn, có tên công ty, không có dấu hiệu thu phí, chưa có trên trang), tự gắn logo và link nguồn, đăng 1 tin. Không có tin mới thì chờ lượt sau.

### Gỡ tin hết hạn (mỗi ngày 0:23)

Tác vụ Claude "Gỡ tin hết hạn timviecso.vn" chạy `python3 -m autopost.timviecso expired --delete`: gỡ mọi tin có hạn nộp trước hôm nay (giờ Việt Nam). Tin không ghi hạn thì giữ. Chạy `expired` không có `--delete` để chỉ xem danh sách.

### Routine rà soát timviecso.vn (tạm dừng)

Tác vụ này đang tắt. Khi bật lại:

1. Chạy `python -m autopost.timviecso list` và lấy các tin đăng từ lần rà trước.
2. Với mỗi tin, mở link "Nguồn: ..." ở cuối mô tả. Gỡ tin (`python -m autopost.timviecso delete <id> --reason "..."`) nếu: tin gốc đã gỡ hoặc hết hạn, công ty đáng ngờ, có dấu hiệu thu phí hay lừa đảo, sai khu vực, hoặc nội dung lỗi nặng (trống, sai lương, sai công ty).
3. Tin chỉ có lỗi nhỏ (dòng thừa như "Phúc lợi:", yêu cầu phân biệt còn sót) thì gỡ rồi đăng lại bản đã sửa bằng `python -m autopost.timviecso post <file.json>`.
4. Đăng thêm tối đa 3 tin TP.HCM mới nhất đã xác minh, theo cách của tác vụ cũ: JSON theo mô tả đầu `autopost/timviecso.py`, `location` là `TP HCM`, tóm tắt bằng lời mình, `source` là link gốc, để trống logo để chương trình tự lấy.
5. Ghi các tin đã gỡ và lý do vào tab `Nhat ky timviecso` của sheet `Lich dang` (tạo tab nếu chưa có: Thời gian, Mã tin, Tiêu đề, Công ty, Việc làm, Lý do).

## Báo cáo hiệu quả hàng tuần (thứ Hai 8:41)

Tác vụ Claude "Báo cáo hiệu quả tuần" chạy `python3 -m autopost.insights --days 7` (số liệu `metrics` của bài trong Buffer: lượt xem, tương tác theo kênh, khung giờ, kiểu bài, top 5 bài), so với tuần trước (`--days 14`), rồi viết đề xuất giờ đăng và kiểu video vào `/mnt/project-files/auto-post/bao-cao/hieu-qua-tuan-<yyyy-mm-dd>.md`. Bài mới đăng dưới 24 giờ chưa đủ số liệu, không dùng để kết luận.
