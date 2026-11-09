import React from "react";
import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import { C, FONT } from "../brand";
import type { BangTinData } from "../types";
import { ease, useSpring } from "../ui";

// Mở đầu có người dẫn chương trình: video người nói khớp khẩu hình (render/presenter.py) phủ kín khung,
// tiếng lấy từ voice[0] nên video để tắt tiếng. Trước khi người dẫn cất lời (VOICE_DELAY) giữ ảnh gốc.
// Luôn có nhãn "Người dẫn AI" để người xem biết đây là nội dung AI.
export const PresenterScene: React.FC<{ data: BangTinData; delay: number }> = ({ data, delay }) => {
  const frame = useCurrentFrame();
  const p = data.presenter!;
  const src = /^https?:/.test(p.src) ? p.src : staticFile(p.src);
  const fit: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
  const badge = useSpring(6, 14, 160);
  // Máy quay đẩy vào rất chậm cho có cảm giác trường quay
  const zoom = interpolate(frame, [0, 600], [1, 1.05], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: "#fff", background: C.deep, overflow: "hidden" }}>
      <AbsoluteFill style={{ scale: String(zoom) }}>
        <Img src={staticFile(p.poster ?? "presenter/poster.jpg")} style={fit} />
        <Sequence from={delay} layout="none">
          <Video src={src} muted style={fit} />
        </Sequence>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 260, background: "linear-gradient(180deg, rgba(6,20,80,.55), rgba(6,20,80,0))" }} />
      <div style={{ position: "absolute", top: 70, left: 50, display: "flex", alignItems: "center", gap: 14, scale: String(badge), transformOrigin: "left center" }}>
        <div style={{ background: "#E5252A", borderRadius: 10, padding: "8px 16px", fontSize: 30, fontWeight: 900, letterSpacing: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", opacity: 0.5 + 0.5 * Math.abs(Math.sin(frame / 10)) }} />
          BẢN TIN
        </div>
        <div style={{ background: "rgba(6,20,80,.8)", borderRadius: 10, padding: "8px 18px", fontSize: 30, fontWeight: 800 }}>{data.date}</div>
      </div>
      <div style={{ position: "absolute", top: 76, right: 50, background: "rgba(0,0,0,.45)", borderRadius: 30, padding: "6px 18px", fontSize: 24, fontWeight: 700, opacity: ease(frame, 10, 24, [0, 0.9]) }}>
        Người dẫn AI
      </div>
    </AbsoluteFill>
  );
};
