import React from "react";
import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import { C, FONT } from "../brand";
import type { BangTinData } from "../types";
import { ease } from "../ui";
import { LowerThird } from "./LowerThird";

// Mở đầu có người dẫn chương trình: video người nói khớp khẩu hình (render/presenter.py) phủ kín khung,
// tiếng lấy từ voice[0] nên video để tắt tiếng. Trước khi người dẫn cất lời (VOICE_DELAY) giữ ảnh gốc.
// Góc trên trái: "BẢN TIN VIỆC LÀM NGÀY dd/mm/yyyy"; dưới: băng chữ tên và chức danh người dẫn.
export const PRESENTER_NAME = "NGUYỄN HOÀI ANH";
export const PRESENTER_TITLE = "CEO | FOUNDER DESIGN24";

export const PresenterScene: React.FC<{ data: BangTinData; delay: number; dur: number }> = ({ data, delay, dur }) => {
  const frame = useCurrentFrame();
  const p = data.presenter!;
  const src = /^https?:/.test(p.src) ? p.src : staticFile(p.src);
  const fit: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
  // Máy quay đẩy vào rất chậm cho có cảm giác trường quay
  const zoom = interpolate(frame, [0, 600], [1, 1.05], { extrapolateRight: "clamp" });
  // Nhãn ngày trượt vào từ trái; băng chữ tên hiện sau khoảng 1 giây, kéo vạch cam rồi mở chữ
  const tag = ease(frame, 4, 20, [0, 1]);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: "#fff", background: C.deep, overflow: "hidden" }}>
      <AbsoluteFill style={{ scale: String(zoom) }}>
        <Img src={staticFile(p.poster ?? "presenter/poster.jpg")} style={fit} />
        <Sequence from={delay} layout="none">
          <Video src={src} muted style={fit} />
        </Sequence>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 240, background: "linear-gradient(180deg, rgba(6,20,80,.6), rgba(6,20,80,0))" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 560, background: "linear-gradient(0deg, rgba(6,20,80,.55), rgba(6,20,80,0))" }} />

      {/* Góc trên trái: bản tin việc làm ngày ... */}
      <div style={{ position: "absolute", top: 64, left: 44, display: "flex", alignItems: "stretch", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.35)", opacity: tag, translate: `${(1 - tag) * -60}px 0` }}>
        <div style={{ background: "#E5252A", padding: "10px 16px", fontSize: 28, fontWeight: 900, letterSpacing: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 13, height: 13, borderRadius: 7, background: "#fff", opacity: 0.45 + 0.55 * Math.abs(Math.sin(frame / 10)) }} />
          BẢN TIN VIỆC LÀM
        </div>
        <div style={{ background: "rgba(6,20,80,.88)", padding: "10px 18px", fontSize: 28, fontWeight: 800, display: "flex", alignItems: "center" }}>
          NGÀY {data.date}
        </div>
      </div>

      <LowerThird name={PRESENTER_NAME} title={PRESENTER_TITLE} start={26} end={dur - 10} />
    </AbsoluteFill>
  );
};
