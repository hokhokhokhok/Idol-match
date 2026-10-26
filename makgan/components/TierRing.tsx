import type { Tier } from "@/lib/popularity";
import { TIER_NAMES } from "@/lib/popularity";

/** 사진 둘레의 등급 색(S 무지개·A 골드·B 실버·C 브론즈). 점수는 보여 주지 않는다. */
export default function TierRing({ tier, children }: { tier: Tier | null; children: React.ReactNode }) {
  if (!tier || tier === "D") return <>{children}</>;
  return (
    <span className={`tier-ring tier-${tier}`} data-tier={tier} role="img" aria-label={`인기 등급 ${TIER_NAMES[tier]}`}>
      {children}
    </span>
  );
}
