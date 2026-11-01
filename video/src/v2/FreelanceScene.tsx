import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, FONT } from "../brand";
import type { BangTinData, Job } from "../types";
import { allJobs, industryOf } from "../derive";
import { BrandBackground, ease, Logo, TopBar, useSpring } from "../ui";
import { CoLogo, Ico, Title } from "./kit";

// Các cảnh của mục Freelancer / việc làm thêm cho sinh viên.
// Bản tin thường: chỉ FreelanceScene (một cảnh). Bản tin tập trung sinh viên (JSON có freelance.groups):
// FreelanceHook (mở đầu), FreelanceOverview (tổng quan), FreelanceScene cho từng nhóm, FreelanceSafety (làm thêm an toàn).

type FL = NonNullable<BangTinData["freelance"]>;
const PURPLE = "#8E24AA";

const TAG_COLOR: Record<string, string> = {
  "part-time": PURPLE,
  "theo ca": PURPLE,
  "thực tập": "#0B86E8",
  "cộng tác viên": "#2E8B3E",
  online: C.orange,
  freelance: C.orange,
  "làm từ xa": C.orange,
};
const tagColor = (tag?: string) => TAG_COLOR[(tag ?? "").toLowerCase()] ?? PURPLE;

// Một nhóm việc: mỗi việc một thẻ có nhãn loại hình, nơi làm, lương, hạn nộp và ghi chú (ca làm, yêu cầu...).
export const FreelanceScene: React.FC<{ kicker: string; title: string; jobs: Job[]; color?: string }> = ({ kicker, title, jobs, color = PURPLE }) => {
  const frame = useCurrentFrame();
  const list = jobs.slice(0, 6);
  const withNotes = list.some((j) => j.note);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: "#fff" }}>
      <BrandBackground />
      <TopBar />
      <Title kicker={kicker} title={title} color={color} />
      <div style={{ position: "absolute", top: 420, left: 50, right: 50, display: "flex", flexDirection: "column", gap: withNotes ? 12 : 14 }}>
        {list.map((j, i) => {
          const d = 14 + i * 8;
          const ind = industryOf(j);
          const col = tagColor(j.tag);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 20, background: "#fff", color: C.ink, borderRadius: 26, padding: withNotes ? "13px 22px" : "16px 22px", boxShadow: "0 14px 34px rgba(0,0,0,.28)", borderLeft: `12px solid ${col}`, opacity: ease(frame, d, d + 10, [0, 1]), translate: `${ease(frame, d, d + 18, [i % 2 ? 600 : -600, 0])}px 0px` }}>
              <CoLogo src={j.logo} size={withNotes ? 96 : 92} icon={ind.icon} color={ind.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {j.tag && <span style={{ flex: "none", background: col, color: "#fff", borderRadius: 999, padding: "3px 16px", fontSize: 22, fontWeight: 800 }}>{j.tag}</span>}
                  <span style={{ fontSize: 33, fontWeight: 900, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.pos}</span>
                </div>
                <div style={{ fontSize: 23, color: C.muted, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.co}</div>
                <div style={{ display: "flex", gap: 18, marginTop: 5, fontSize: 25, fontWeight: 800, whiteSpace: "nowrap" }}>
                  {j.area && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.blue1 }}>
                      <Ico name={/xa|remote|online/i.test(j.area) ? "laptop" : "pin"} size={25} color={C.blue1} />
                      {j.area}
                    </span>
                  )}
                  <span style={{ color: C.orange }}>{j.sal}</span>
                  {j.dl && <span style={{ color: C.muted, fontWeight: 700 }}>Hạn {j.dl}</span>}
                </div>
                {j.note && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 23, fontWeight: 600, color: "#3D4A6B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <Ico name="clock" size={23} color={col} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{j.note}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Mở đầu bản tin sinh viên: số việc làm thêm đếm lên, các nhóm việc, và số việc làm toàn thời gian đi kèm.
export const FreelanceHook: React.FC<{ data: BangTinData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const fl = data.freelance!;
  const total = fl.total ?? (fl.groups ?? []).reduce((a, g) => a + (g.total ?? g.jobs.length), 0);
  const logo = useSpring(0, 12, 160);
  const num = ease(frame, 10, 40, [0, 1]);
  const punch = useSpring(40, 8, 220);
  const pill = useSpring(52, 10, 170);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: "#fff" }}>
      <BrandBackground />
      <div style={{ position: "absolute", top: 120, left: 0, right: 0, display: "flex", justifyContent: "center", scale: String(logo) }}>
        <Logo width={200} pad={20} />
      </div>
      <div style={{ position: "absolute", top: 345, left: 0, right: 0, textAlign: "center", fontSize: 32, fontWeight: 700, opacity: ease(frame, 8, 20, [0, 0.85]) }}>
        Bản tin Tìm Việc Số • {data.date}
      </div>
      <div style={{ position: "absolute", top: 420, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: ease(frame, 4, 16, [0, 1]), translate: `0px ${ease(frame, 4, 20, [40, 0])}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, background: PURPLE, borderRadius: 999, padding: "14px 34px", fontSize: 50, fontWeight: 900 }}>
          <Ico name="graduation" size={56} />
          Dành cho sinh viên
        </div>
      </div>
      <div style={{ position: "absolute", top: 520, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ fontSize: 380, fontWeight: 900, letterSpacing: -20, lineHeight: 1, textShadow: "0 30px 80px rgba(0,0,0,.35)", scale: String(0.85 + 0.15 * punch) }}>{Math.round(total * num)}</div>
        <div style={{ fontSize: (fl.label ?? "VIỆC LÀM THÊM").length > 16 ? 72 : 92, fontWeight: 900, letterSpacing: -2, marginTop: -10, opacity: ease(frame, 30, 42, [0, 1]) }}>
          {fl.label ?? "VIỆC LÀM THÊM"}
        </div>
        {fl.place && <div style={{ fontSize: 80, fontWeight: 900, color: C.orange, marginTop: 4, opacity: ease(frame, 34, 46, [0, 1]) }}>{fl.place.toUpperCase()}</div>}
        <div style={{ fontSize: 42, fontWeight: 800, marginTop: 6, opacity: ease(frame, 40, 52, [0, 0.95]) }}>Thực tập • Part-time • Cộng tác viên</div>
      </div>
      <div style={{ position: "absolute", top: fl.place ? 1360 : 1250, left: 0, right: 0, display: "flex", justifyContent: "center", scale: String(pill) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, background: `linear-gradient(90deg, ${C.orange}, ${C.orange2})`, borderRadius: 999, padding: "24px 44px", fontSize: 48, fontWeight: 900, boxShadow: "0 20px 60px rgba(255,127,20,.55)" }}>
          <Ico name="briefcase" size={54} />+ {allJobs(data).length} việc làm toàn thời gian
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Tổng quan việc làm thêm: các ô số liệu theo nhóm và ghi chú về lương, ca làm.
export const FreelanceOverview: React.FC<{ fl: FL }> = ({ fl }) => {
  const frame = useCurrentFrame();
  const stats = (fl.stats ?? []).slice(0, 4);
  const top = fl.name.length > 18 ? 560 : 450;
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: "#fff" }}>
      <BrandBackground />
      <TopBar />
      <Title kicker={fl.sub} title={fl.name} color={PURPLE} />
      <div style={{ position: "absolute", top, left: 60, right: 60, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {stats.map((s, i) => {
          const d = 12 + i * 8;
          const p = ease(frame, d, d + 24, [0, 1]);
          const n = Number(s.value);
          return (
            <div key={i} style={{ background: "#fff", color: C.ink, borderRadius: 32, padding: "28px 28px 24px", boxShadow: "0 18px 44px rgba(0,0,0,.3)", opacity: ease(frame, d, d + 10, [0, 1]), translate: `0px ${ease(frame, d, d + 18, [120, 0])}px` }}>
              <div style={{ width: 84, height: 84, borderRadius: 24, background: [C.blue2, PURPLE, C.green, C.orange][i % 4], display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ico name={s.icon} size={48} />
              </div>
              <div style={{ fontSize: 120, fontWeight: 900, letterSpacing: -4, lineHeight: 1, marginTop: 14, color: [C.blue2, PURPLE, C.green, C.orange][i % 4] }}>{Number.isFinite(n) ? Math.round(n * p) : s.value}</div>
              <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.15, marginTop: 6 }}>{s.label}</div>
            </div>
          );
        })}
      </div>
      {fl.payNote && (
        <div style={{ position: "absolute", top: top + 790, left: 60, right: 60, display: "flex", alignItems: "center", gap: 22, background: "rgba(255,255,255,.14)", border: "2px solid rgba(255,255,255,.28)", borderRadius: 28, padding: "22px 28px", opacity: ease(frame, 50, 62, [0, 1]) }}>
          <Ico name="wallet" size={60} color={C.orange2} />
          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.25 }}>{fl.payNote}</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// Làm thêm an toàn: các lưu ý chống lừa đảo cho sinh viên.
export const FreelanceSafety: React.FC<{ tips: { icon: string; text: string }[] }> = ({ tips }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: "#fff" }}>
      <BrandBackground />
      <TopBar />
      <Title kicker="Lưu ý cho sinh viên" title="Làm thêm an toàn" color="#E53935" />
      <div style={{ position: "absolute", top: 450, left: 60, right: 60, display: "flex", flexDirection: "column", gap: 22 }}>
        {tips.slice(0, 5).map((t, i) => {
          const d = 12 + i * 12;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 26, background: "#fff", color: C.ink, borderRadius: 28, padding: "24px 28px", boxShadow: "0 16px 40px rgba(0,0,0,.3)", opacity: ease(frame, d, d + 10, [0, 1]), translate: `${ease(frame, d, d + 18, [500, 0])}px 0px` }}>
              <div style={{ width: 96, height: 96, flex: "none", borderRadius: "50%", background: i === tips.length - 1 ? C.orange : "#E53935", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ico name={t.icon} size={52} />
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.25 }}>{t.text}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
