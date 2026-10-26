import Link from "next/link";
import Avatar from "./Avatar";
import TierRing from "./TierRing";
import type { Tier } from "@/lib/popularity";

/** 원형 사진 + 이름(+배역). 팔로우 중이면 사진에 표시. */
export default function ActorChip({ id, name, photoUrl, role, following, tier }: { id: string; name: string; photoUrl: string | null; role?: string; following?: boolean; tier?: Tier | null }) {
  return (
    <Link href={`/actors/${id}`} className="actor-chip">
      <span className="actor-chip-photo">
        <TierRing tier={tier ?? null}><Avatar src={photoUrl} alt={name} /></TierRing>
        {following && <span className="following-dot" aria-label="팔로우 중">✓</span>}
      </span>
      <span className="actor-chip-name">{name}</span>
      {role && <span className="actor-chip-role">{role}</span>}
    </Link>
  );
}
