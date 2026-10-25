"use client";
import ToggleButton from "./ToggleButton";
import { toggleFollow } from "@/lib/actions/follow";

export default function FollowButton({ actorId, name, following, small }: { actorId: string; name: string; following: boolean; small?: boolean }) {
  return (
    <ToggleButton
      on={following}
      action={() => toggleFollow(actorId)}
      labels={{ on: "팔로잉", off: "팔로우", aria: `${name} 팔로우` }}
      className={`btn follow-btn ${small ? "btn-small" : ""}`}
    />
  );
}
