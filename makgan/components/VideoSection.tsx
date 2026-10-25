import YouTubeEmbed from "./YouTubeEmbed";
import type { Video } from "@/lib/data/videos";

export default function VideoSection({ videos }: { videos: Video[] }) {
  if (!videos.length) return null;
  return (
    <section className="section" aria-labelledby="videos-title">
      <h3 className="section-title" id="videos-title">영상 <span className="muted">{videos.length}</span></h3>
      <ul className="video-list">
        {videos.map((v) => (
          <li key={v.id}>
            <YouTubeEmbed id={v.youtube_id} title={v.title} />
            <p className="video-title">{v.title}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
