import type { VerificationStatus } from "@/lib/types";

export default function StatusBadge({ status }: { status: VerificationStatus }) {
  const ok = status === "확인됨";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? "bg-emerald-50 text-ok" : "bg-amber-50 text-warn"
      }`}
    >
      {status}
    </span>
  );
}
