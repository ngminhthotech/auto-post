// logo, cover: ảnh của nhà tuyển dụng lấy từ tin gốc (đường dẫn trong video/public hoặc URL)
// tag, area: dùng cho mục Freelancer / việc làm thêm (vd. "Part-time", "Thực tập", "Làm từ xa"); src: link tin gốc
export type Job = { pos: string; co: string; sal: string; dl?: string; id?: string; logo?: string; cover?: string; tag?: string; area?: string; src?: string };
export type JobList = { name: string; sub: string; theme: string; jobs: Job[] };
export type Cell = { province: string; color: string; jobs: Job[] };
export type Stat = { icon: string; value: string; label: string };
export type BangTinData = {
  date: string;
  regionsLine: string[];
  stats: Stat[];
  lists: JobList[];
  grid?: { name: string; sub: string; cells: Cell[] };
  // Mục Freelancer / việc làm thêm cho sinh viên (không tính vào số vị trí, top lương, ngành nghề)
  freelance?: { name: string; sub: string; jobs: Job[] };
  notes: string[];
  cta: string;
  // Giọng đọc từng cảnh (render/voice.py tạo), theo thứ tự cảnh trong video
  voice?: { src: string; dur: number; text?: string }[];
  // Cảnh quay thật làm nền từng cảnh (đường dẫn trong video/public, dur = độ dài clip, giây)
  broll?: { src: string; dur: number }[];
};
