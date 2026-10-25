"use client";
import { useState } from "react";
import { youTubeEmbed, youTubeThumb } from "@/lib/youtube";

/** 유튜브: 썸네일 먼저, 누르면 그때 플레이어를 불러와 재생(SPEC-2 A-1, lazy) */
export default function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="yt">
      {playing ? (
        <iframe
          src={youTubeEmbed(id)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" className="yt-thumb" style={{ backgroundImage: `url(${youTubeThumb(id)})` }} onClick={() => setPlaying(true)} aria-label={`${title} 재생`}>
          <span className="yt-play" aria-hidden="true">▶</span>
        </button>
      )}
    </div>
  );
}
