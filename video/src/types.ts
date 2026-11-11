// logo, cover: ảnh của nhà tuyển dụng lấy từ tin gốc (đường dẫn trong video/public hoặc URL)
// tag, area, note: dùng cho mục Freelancer / việc làm thêm (vd. tag "Part-time", area "Làm từ xa", note "Ca 16h–23h, xếp theo lịch học"); src: link tin gốc
export type Job = { pos: string; co: string; sal: string; dl?: string; id?: string; logo?: string; cover?: string; tag?: string; area?: string; note?: string; src?: string };
// Một nhóm việc làm thêm (Thực tập, Part-time theo ca, Cộng tác viên/online...): total = số tin của nhóm trong danh sách đầy đủ, say = cách đọc ("vị trí thực tập")
export type FreelanceGroup = { name: string; sub: string; color: string; total?: number; say?: string; jobs: Job[] };
export type JobList = { name: string; sub: string; theme: string; jobs: Job[] };
export type Cell = { province: string; color: string; jobs: Job[] };
export type Stat = { icon: string; value: string; label: string };
export type BangTinData = {
  date: string;
  regionsLine: string[];
  stats: Stat[];
  lists: JobList[];
  grid?: { name: string; sub: string; cells: Cell[] };
  // Mục Freelancer / việc làm thêm cho sinh viên (không tính vào số vị trí, top lương, ngành nghề).
  // Chỉ có jobs: một cảnh sau các khu vực. Có groups: bản tin tập trung sinh viên (mục này lên đầu, nhiều cảnh, xem BangTinPro.tsx).
  freelance?: {
    name: string;
    sub: string;
    jobs?: Job[];
    total?: number;
    // Nơi làm việc của cả mục (vd. "Cần Thơ"): hiện ở cảnh mở đầu và đọc "việc làm thêm tại ..."
    place?: string;
    // Chữ lớn ở cảnh mở đầu (mặc định "VIỆC LÀM THÊM") và cách gọi trong lời đọc (vd. "việc làm bán thời gian tại Cần Thơ")
    label?: string;
    say?: string;
    stats?: { value: string; label: string; icon: string }[];
    payNote?: string;
    groups?: FreelanceGroup[];
    tips?: { icon: string; text: string }[];
  };
  notes: string[];
  cta: string;
  // Giọng đọc từng cảnh (render/voice.py tạo), theo thứ tự cảnh trong video
  voice?: { src: string; dur: number; text?: string }[];
  // Cảnh quay thật làm nền từng cảnh (đường dẫn trong video/public, dur = độ dài clip, giây)
  broll?: { src: string; dur: number }[];
  // Người dẫn chương trình ở cảnh mở đầu (render/presenter.py): video khớp khẩu hình và ảnh gốc làm khung chờ
  presenter?: { src: string; dur: number; poster?: string; pops?: import("./v2/StatPops").StatPop[] };
};
