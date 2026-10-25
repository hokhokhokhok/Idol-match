import Link from "next/link";
import Avatar from "./Avatar";

/** 원형 사진 + 이름(+배역). 팔로우 표시는 4단계. */
export default function ActorChip({ id, name, photoUrl, role }: { id: string; name: string; photoUrl: string | null; role?: string }) {
  return (
    <Link href={`/actors/${id}`} className="actor-chip">
      <Avatar src={photoUrl} alt={name} />
      <span className="actor-chip-name">{name}</span>
      {role && <span className="actor-chip-role">{role}</span>}
    </Link>
  );
}
