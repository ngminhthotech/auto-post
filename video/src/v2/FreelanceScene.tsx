import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, FONT } from "../brand";
import type { BangTinData } from "../types";
import { industryOf } from "../derive";
import { BrandBackground, ease, TopBar } from "../ui";
import { CoLogo, Ico, Title } from "./kit";

const TAG_COLOR: Record<string, string> = {
  "part-time": "#8E24AA",
  "thực tập": "#0B86E8",
  "cộng tác viên": "#2E8B3E",
  freelance: C.orange,
  "làm từ xa": C.orange,
};
const tagColor = (tag?: string) => TAG_COLOR[(tag ?? "").toLowerCase()] ?? "#8E24AA";

// Freelancer / việc làm thêm cho sinh viên: mỗi việc một thẻ có nhãn loại hình (Part-time, Thực tập, Freelance...).
export const FreelanceScene: React.FC<{ data: NonNullable<BangTinData["freelance"]> }> = ({ data }) => {
  const frame = useCurrentFrame();
  const jobs = data.jobs.slice(0, 6);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: "#fff" }}>
      <BrandBackground />
      <TopBar />
      <Title kicker={data.sub} title={data.name} color="#8E24AA" />
      <div style={{ position: "absolute", top: 430, left: 60, right: 60, display: "flex", flexDirection: "column", gap: 14 }}>
        {jobs.map((j, i) => {
          const d = 14 + i * 8;
          const ind = industryOf(j);
          const col = tagColor(j.tag);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 22, background: "#fff", color: C.ink, borderRadius: 26, padding: "16px 22px", boxShadow: "0 14px 34px rgba(0,0,0,.28)", borderLeft: `12px solid ${col}`, opacity: ease(frame, d, d + 10, [0, 1]), translate: `${ease(frame, d, d + 18, [i % 2 ? 600 : -600, 0])}px 0px` }}>
              <CoLogo src={j.logo} size={92} icon={ind.icon} color={ind.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {j.tag && <span style={{ flex: "none", background: col, color: "#fff", borderRadius: 999, padding: "3px 16px", fontSize: 22, fontWeight: 800 }}>{j.tag}</span>}
                  <span style={{ fontSize: 33, fontWeight: 900, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.pos}</span>
                </div>
                <div style={{ fontSize: 24, color: C.muted, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.co}</div>
                <div style={{ display: "flex", gap: 18, marginTop: 6, fontSize: 25, fontWeight: 800 }}>
                  {j.area && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.blue1 }}>
                      <Ico name={/xa|remote|online/i.test(j.area) ? "globe" : "pin"} size={25} color={C.blue1} />
                      {j.area}
                    </span>
                  )}
                  <span style={{ color: C.orange }}>{j.sal}</span>
                  {j.dl && <span style={{ color: C.muted, fontWeight: 700 }}>Hạn {j.dl}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
