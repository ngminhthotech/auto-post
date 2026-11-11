import React from "react";
import { Audio } from "@remotion/media";
import { Easing, interpolate, interpolateColors, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../brand";

// Số liệu hiện trong khung ghi công khi người dẫn đọc tới: mỗi mục có "at" (giây, tính từ lúc người dẫn cất lời).
// kicker: nhãn trên (ví dụ "CẦN THƠ"); label: dòng mô tả; icon: grad | briefcase | pin; color: màu nhấn của số đó.
export type StatPop = { at: number; value: number; kicker: string; label: string; icon?: "grad" | "briefcase" | "pin"; color?: string };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);
const PALETTE = [C.orange, "#1E7BFF", "#00B4D8", "#22B04B", "#E5252A"];
export const colorOf = (pops: StatPop[], i: number) => pops[i]?.color ?? PALETTE[i % PALETTE.length];
const markOf = (p: StatPop, delay: number, fps: number) => delay + Math.round(p.at * fps);

const Icon: React.FC<{ kind?: StatPop["icon"]; size: number }> = ({ kind = "pin", size }) => {
  const s = { width: size, height: size, fill: "#fff" } as const;
  if (kind === "grad")
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3zm-6.5 9.6V16c0 1.7 2.9 3.5 6.5 3.5s6.5-1.8 6.5-3.5v-3.4L12 16.2l-6.5-3.6z" />
      </svg>
    );
  if (kind === "briefcase")
    return (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M9 3h6a2 2 0 0 1 2 2v2h3a2 2 0 0 1 2 2v4H2V9a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2zm0 4h6V5H9v2zM2 14.5h8V16h4v-1.5h8V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4.5z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" style={s}>
      <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2z" />
    </svg>
  );
};

// Số lật kiểu bảng điện: mỗi chữ số cuộn qua vài vòng rồi dừng đúng số
const Odometer: React.FC<{ value: number; f: number; h: number }> = ({ value, f, h }) => {
  const digits = String(value).split("").map(Number);
  return (
    <div style={{ display: "flex", height: h, overflow: "hidden" }}>
      {digits.map((d, i) => {
        const loops = 1 + (digits.length - 1 - i); // hàng đơn vị cuộn nhiều hơn
        const total = loops * 10 + d;
        const pos = interpolate(f, [0, 16 + i * 3], [0, total], { ...clamp, easing: Easing.bezier(0.2, 0.7, 0.2, 1) });
        const base = Math.floor(pos);
        const frac = pos - base;
        return (
          <div key={i} style={{ position: "relative", width: h * 0.6, height: h }}>
            {[0, 1].map((k) => (
              <div key={k} style={{ position: "absolute", left: 0, right: 0, top: (k - frac) * h, height: h, textAlign: "center", lineHeight: `${h}px` }}>
                {(base + k) % 10}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

// Vòng sóng và tia lấp lánh bung ra từ con số
const Burst: React.FC<{ f: number; color: string }> = ({ f, color }) => {
  const ring = interpolate(f, [0, 20], [0.2, 2.4], { ...clamp, easing: out });
  const ringO = interpolate(f, [0, 3, 20], [0, 1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", width: 160, height: 160, left: -80, top: -80, borderRadius: "50%", border: `6px solid ${color}`, boxShadow: `0 0 24px ${color}`, scale: String(ring), opacity: ringO }} />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 + 12) * (Math.PI / 180);
        const dist = interpolate(f, [0, 22], [20, 150 + (i % 3) * 30], { ...clamp, easing: out });
        const o = interpolate(f, [0, 4, 24], [0, 1, 0], clamp);
        const sz = 10 + (i % 3) * 5;
        return (
          <div key={i} style={{ position: "absolute", width: sz, height: sz, left: Math.cos(a) * dist - sz / 2, top: Math.sin(a) * dist - sz / 2,
            background: i % 2 ? "#fff" : C.orange2, rotate: "45deg", opacity: o, boxShadow: `0 0 10px ${i % 2 ? "#fff" : C.orange2}`, scale: String(1 - f / 30) }} />
        );
      })}
    </div>
  );
};

const Stat: React.FC<{ p: StatPop; f: number; color: string }> = ({ p, f, color }) => {
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - 14, fps, config: { damping: 7, stiffness: 280, mass: 0.5 } });
  const numScale = 1 + 0.16 * Math.sin(Math.min(1, pop) * Math.PI);
  const pill = spring({ frame: f - 4, fps, config: { damping: 12, stiffness: 200, mass: 0.6 } });
  const lineIn = interpolate(f, [10, 24], [0, 1], { ...clamp, easing: out });
  const H = 150;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <div style={{ position: "relative", flex: "none" }}>
        <Burst f={f} color={color} />
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", scale: String(numScale), transformOrigin: "50% 60%" }}>
          <div style={{ fontSize: H, fontWeight: 900, letterSpacing: -4, fontVariantNumeric: "tabular-nums",
            backgroundImage: "linear-gradient(180deg, #ffffff 0%, #ffffff 45%, #FFD08A 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            filter: `drop-shadow(0 0 18px ${color}) drop-shadow(0 6px 10px rgba(0,0,0,.45))` }}>
            <Odometer value={p.value} f={f} h={H} />
          </div>
        </div>
      </div>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 12, padding: "8px 20px 8px 10px", borderRadius: 40,
          background: color, boxShadow: `0 8px 22px rgba(0,0,0,.35), 0 0 22px ${color}`, scale: String(pill), transformOrigin: "0 50%" }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: "rgba(255,255,255,.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon kind={p.icon} size={30} />
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#fff", whiteSpace: "nowrap", letterSpacing: 0.5 }}>{p.kicker}</div>
        </div>
        <div style={{ fontSize: 31, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", opacity: lineIn, translate: `${(1 - lineIn) * 30}px 0` }}>{p.label}</div>
      </div>
    </div>
  );
};

// Lớp nội dung lật kiểu bảng tin: lớp cũ lật lên, lớp mới lật từ dưới vào
const Flip: React.FC<{ enter: number; exit: number; children: React.ReactNode }> = ({ enter, exit, children }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", transformOrigin: "50% 50%",
    transform: `perspective(900px) rotateX(${(1 - enter) * -85 + exit * 85}deg)`, opacity: Math.min(1, enter * 1.5) * (1 - exit), backfaceVisibility: "hidden" }}>
    {children}
  </div>
);

// Nội dung bên phải logo trong khung ghi công: "credit" là chữ ghi công ban đầu, tới mốc của từng số liệu thì lật sang số đó.
export const CreditContent: React.FC<{ credit: React.ReactNode; pops?: StatPop[]; delay: number }> = ({ credit, pops = [], delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const marks = pops.map((p) => markOf(p, delay, fps));
  const sp = (f: number) => spring({ frame: f, fps, config: { damping: 14, stiffness: 150, mass: 0.7 } });
  const exitOf = (m?: number) => (m === undefined ? 0 : Math.min(1, sp(frame - m) * 1.4));
  const cur = marks.filter((m) => frame >= m).length - 1; // -1: còn đang hiện chữ ghi công
  return (
    <div style={{ position: "relative", flex: 1, height: 200 }}>
      {cur <= 0 && <Flip enter={1} exit={exitOf(marks[0])}>{credit}</Flip>}
      {pops.map((p, i) =>
        i === cur || i === cur - 1 ? (
          <Flip key={i} enter={sp(frame - marks[i])} exit={exitOf(marks[i + 1])}>
            <Stat p={p} f={frame - marks[i]} color={colorOf(pops, i)} />
          </Flip>
        ) : null,
      )}
      {/* Chấm tiến trình: số đang hiện / tổng số */}
      {cur >= 0 && (
        <div style={{ position: "absolute", right: 0, bottom: -18, display: "flex", gap: 8 }}>
          {pops.map((_, i) => (
            <div key={i} style={{ height: 10, borderRadius: 5, width: i === cur ? 34 : 10, background: i <= cur ? colorOf(pops, i) : "rgba(255,255,255,.3)" }} />
          ))}
        </div>
      )}
    </div>
  );
};

// Hiệu ứng cho cả khung: màu nền nhấn theo số đang hiện, độ lóe khi đổi số, vệt sáng quét ngang
export const creditFx = (frame: number, pops: StatPop[] = [], delay: number, fps: number) => {
  const marks = pops.map((p) => markOf(p, delay, fps));
  const cur = marks.filter((m) => frame >= m).length - 1;
  const flash = marks.reduce((m, at) => Math.max(m, interpolate(frame - at, [0, 2, 16], [0, 1, 0], clamp)), 0);
  const last = cur >= 0 ? marks[cur] : -999;
  const sweep = interpolate(frame - last, [0, 14], [-20, 120], clamp);
  const prev = cur > 0 ? colorOf(pops, cur - 1) : "#0B86E8";
  const accent = cur >= 0 ? interpolateColors(frame - last, [0, 10], [prev, colorOf(pops, cur)]) : "#0B86E8";
  return { cur, flash, sweep, accent };
};

// Tiếng "ting ting" mỗi lần một số liệu hiện lên
export const StatSounds: React.FC<{ pops?: StatPop[]; delay: number }> = ({ pops = [], delay }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {pops.map((p, i) => (
        <Sequence key={i} from={markOf(p, delay, fps)} durationInFrames={30} layout="none">
          <Audio src={staticFile("ting.wav")} volume={0.55} />
        </Sequence>
      ))}
    </>
  );
};
