import Link from "next/link";
import Avatar from "./Avatar";

/** 원형 사진 + 이름(+배역). 팔로우 중이면 사진에 표시. */
export default function ActorChip({ id, name, photoUrl, role, following }: { id: string; name: string; photoUrl: string | null; role?: string; following?: boolean }) {
  return (
    <Link href={`/actors/${id}`} className="actor-chip">
      <span className="actor-chip-photo">
        <Avatar src={photoUrl} alt={name} />
        {following && <span className="following-dot" aria-label="팔로우 중">✓</span>}
      </span>
      <span className="actor-chip-name">{name}</span>
      {role && <span className="actor-chip-role">{role}</span>}
    </Link>
  );
}
