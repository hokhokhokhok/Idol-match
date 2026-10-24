/** 아직 구현 전인 화면 자리. 해당 단계에서 실제 화면으로 바뀐다. */
export default function Placeholder({ icon, title, step }: { icon: string; title: string; step: number }) {
  return (
    <div className="placeholder">
      <div className="icon" aria-hidden="true">{icon}</div>
      <strong>{title}</strong>
      <span>{step}단계에서 만들어요</span>
    </div>
  );
}
