import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../brand";
import { CreditContent, creditFx, type StatPop } from "./StatPops";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);
const inn = Easing.bezier(0.7, 0, 0.84, 0);

// Băng chữ tên người dẫn kiểu truyền hình: khối logo D24 bật ra, dải tên mở ra từ sau logo theo cạnh vát,
// chữ trượt lên trong khung, vệt sáng quét qua một lần; cuối cảnh thu lại theo chiều ngược.
export const LowerThird: React.FC<{ name: string; title: string; kicker?: string; logoSrc?: string; start?: number; end: number }> = ({
  name,
  title,
  kicker = "NGƯỜI DẪN CHƯƠNG TRÌNH",
  logoSrc = "logo-d24.png",
  start = 24,
  end,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - start;
  const leave = interpolate(frame, [end - 18, end], [0, 1], { ...clamp, easing: inn });
  const logo = spring({ frame: f, fps, config: { damping: 13, stiffness: 170, mass: 0.7 } }) * (1 - leave);
  const wipe = interpolate(f, [6, 26], [0, 1], { ...clamp, easing: out }) * (1 - leave);
  const nameIn = interpolate(f, [14, 32], [0, 1], { ...clamp, easing: out });
  const titleIn = interpolate(f, [22, 40], [0, 1], { ...clamp, easing: out });
  const kickIn = interpolate(f, [30, 46], [0, 1], { ...clamp, easing: out }) * (1 - leave);
  const shine = interpolate(f, [44, 80], [-30, 130], clamp);
  const glow = 0.55 + 0.45 * Math.sin(frame / 18);
  if (f < 0 || leave >= 1) return null;
  const H = 168;
  const slant = 46;
  return (
    <div style={{ position: "absolute", left: 40, bottom: 290, fontFamily: FONT, display: "flex", alignItems: "flex-end" }}>
      {/* Khối logo */}
      <div style={{ position: "relative", zIndex: 2, width: H, height: H, borderRadius: 22, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 18px 40px rgba(0,0,0,.45)", scale: String(logo), rotate: `${(1 - logo) * -12}deg` }}>
        <Img src={staticFile(logoSrc)} style={{ width: H * 0.74 }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: 22, boxShadow: `inset 0 0 0 4px ${C.orange}` }} />
      </div>

      <div style={{ position: "relative", marginLeft: -22, height: H, clipPath: `inset(-60px ${(1 - wipe) * 100}% -10px 0)` }}>
        {/* Dòng nhỏ phía trên */}
        <div style={{ position: "absolute", left: 40, top: -50, padding: "6px 16px 6px 14px", borderRadius: "8px 8px 0 0", background: "rgba(6,20,80,.88)", borderLeft: `4px solid ${C.orange}`, fontSize: 22, fontWeight: 800, letterSpacing: 5, color: "#fff", opacity: kickIn, translate: `0 ${(1 - kickIn) * 14}px` }}>
          {kicker}
        </div>
        <div style={{ height: H, display: "flex", flexDirection: "column", filter: "drop-shadow(0 16px 30px rgba(0,0,0,.45))" }}>
          {/* Dải tên */}
          <div style={{ position: "relative", height: 104, paddingLeft: 52, paddingRight: 70 + slant, display: "flex", alignItems: "center", overflow: "hidden",
            background: `linear-gradient(100deg, ${C.deep} 0%, ${C.blue1} 55%, ${C.blue2} 100%)`,
            clipPath: `polygon(0 0, 100% 0, calc(100% - ${slant}px) 100%, 0 100%)` }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: "linear-gradient(90deg, rgba(255,255,255,.0), rgba(255,255,255,.55), rgba(255,255,255,.0))" }} />
            <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: 2, color: "#fff", lineHeight: 1, whiteSpace: "nowrap", textShadow: "0 3px 12px rgba(0,0,0,.35)", translate: `0 ${(1 - nameIn) * 110}%`, opacity: nameIn }}>
              {name}
            </div>
            <div style={{ position: "absolute", top: -40, bottom: -40, width: 120, left: `${shine}%`, background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.38), rgba(255,255,255,0))", rotate: "18deg" }} />
          </div>
          {/* Dải chức danh */}
          <div style={{ height: 64, display: "flex" }}>
            <div style={{ position: "relative", paddingLeft: 52, paddingRight: 40 + slant, display: "flex", alignItems: "center", overflow: "hidden",
              background: `linear-gradient(90deg, ${C.orange} 0%, ${C.orange2} 100%)`,
              clipPath: `polygon(0 0, calc(100% - ${slant * 0.6}px) 0, calc(100% - ${slant}px) 100%, 0 100%)` }}>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 5, color: "#fff", whiteSpace: "nowrap", textShadow: "0 2px 6px rgba(120,40,0,.35)", translate: `0 ${(1 - titleIn) * 110}%`, opacity: titleIn }}>
                {title}
              </div>
            </div>
          </div>
        </div>
        {/* Vạch sáng mảnh chạy dọc mép dưới */}
        <div style={{ position: "absolute", left: 22, bottom: -8, height: 4, width: `${wipe * 72}%`, borderRadius: 2, background: `linear-gradient(90deg, ${C.orange2}, rgba(255,162,63,0))`, opacity: glow }} />
      </div>
    </div>
  );
};

// Khung ghi công dự án (trọng tâm của cảnh mở đầu): logo Tìm Việc Số và dòng
// "Dự án được nghiên cứu và phát triển bởi HỌC VIỆN DESIGN24", căn giữa phía dưới khung hình.
// pops: số liệu thay vào chữ ghi công đúng lúc người dẫn đọc tới (delay: khung hình người dẫn bắt đầu nói)
export const ProjectCredit: React.FC<{ start: number; end: number; pops?: StatPop[]; delay?: number }> = ({ start, end, pops, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - start;
  const leave = interpolate(frame, [end - 16, end], [0, 1], { ...clamp, easing: inn });
  const rise = spring({ frame: f, fps, config: { damping: 16, stiffness: 120, mass: 0.9 } });
  const logo = spring({ frame: f - 8, fps, config: { damping: 11, stiffness: 160, mass: 0.7 } });
  const l1 = interpolate(f, [14, 30], [0, 1], { ...clamp, easing: out });
  const l2 = interpolate(f, [22, 40], [0, 1], { ...clamp, easing: out });
  const band = interpolate(f, [30, 50], [0, 1], { ...clamp, easing: out });
  const shine = interpolate((f - 60) % 150, [0, 50], [-40, 140], clamp);
  const pulse = 0.5 + 0.5 * Math.sin(frame / 16);
  const { cur, flash, sweep, accent } = creditFx(frame, pops, delay, fps);
  if (f < 0 || leave >= 1) return null;
  const show = Math.min(1, rise) * (1 - leave);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 230, display: "flex", justifyContent: "center", fontFamily: FONT, opacity: show, translate: `0 ${(1 - rise) * 160 + leave * 60}px` }}>
      <div style={{ position: "relative", width: 1000, padding: "34px 40px 34px 34px", borderRadius: 34, display: "flex", alignItems: "center", gap: 30, overflow: "hidden",
        background: cur >= 0 ? `linear-gradient(120deg, rgba(4,12,52,.95) 0%, rgba(8,28,100,.93) 55%, ${accent} 140%)` : "linear-gradient(135deg, rgba(6,20,80,.92) 0%, rgba(10,42,140,.9) 60%, rgba(11,134,232,.85) 100%)",
        boxShadow: `0 30px 70px rgba(0,0,0,.5), inset 0 0 0 2px rgba(255,255,255,.22), 0 0 ${40 + 30 * pulse + 70 * flash}px ${cur >= 0 ? accent : "rgba(11,134,232,.45)"}, inset 0 0 0 ${2 + 5 * flash}px rgba(255,255,255,${0.25 + 0.6 * flash})` }}>
        {cur >= 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${sweep}%`, width: 90, background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.55), rgba(255,255,255,0))", rotate: "12deg", scale: "1 1.6" }} />}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 4, background: `linear-gradient(90deg, ${C.orange}, ${C.orange2}, rgba(255,162,63,0))` }} />
        <div style={{ flex: "none", width: 190, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ width: 180, height: 160, display: "flex", alignItems: "center", justifyContent: "center", scale: String(logo), rotate: `${(1 - logo) * 14}deg` }}>
            <Img src={staticFile("logo-tvs.png")} style={{ width: 170, filter: "drop-shadow(0 14px 22px rgba(0,0,0,.45))" }} />
          </div>
          {/* Địa chỉ kênh dưới logo Tìm Việc Số */}
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.2, color: "#fff", whiteSpace: "nowrap", opacity: l2, padding: "4px 8px", borderRadius: 8, background: "rgba(255,255,255,.14)" }}>
            www.timviecso.vn
          </div>
        </div>
        <CreditContent delay={delay} pops={pops} credit={
        <div style={{ color: "#fff" }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 6, color: C.orange2, opacity: l1, translate: `0 ${(1 - l1) * 20}px` }}>BẢN TIN TÌM VIỆC SỐ</div>
          <div style={{ marginTop: 10, fontSize: 35, fontWeight: 700, lineHeight: 1.2, whiteSpace: "nowrap", opacity: l2, translate: `0 ${(1 - l2) * 24}px` }}>
            Dự án được nghiên cứu và phát triển bởi
          </div>
          <div style={{ marginTop: 14, display: "inline-block", position: "relative", clipPath: `inset(0 ${(1 - band) * 100}% 0 0)` }}>
            <div style={{ padding: "10px 24px", borderRadius: 14, background: `linear-gradient(90deg, ${C.orange}, ${C.orange2})`, fontSize: 58, fontWeight: 900, letterSpacing: 1.5, lineHeight: 1.05, whiteSpace: "nowrap", textShadow: "0 3px 10px rgba(120,40,0,.35)" }}>
              HỌC VIỆN DESIGN24
            </div>
          </div>
        </div>
        } />
        <div style={{ position: "absolute", top: -60, bottom: -60, width: 160, left: `${shine}%`, background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.22), rgba(255,255,255,0))", rotate: "20deg" }} />
      </div>
    </div>
  );
};
