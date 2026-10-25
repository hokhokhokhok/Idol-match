"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * 바텀시트(필터·선택기, SPEC-2 A-1). 손잡이를 아래로 끌거나(80px 이상), 바깥을 누르거나, Esc로 닫는다.
 * trigger: 여는 버튼 내용
 */
export default function BottomSheet({ trigger, title, children, triggerClassName }: { trigger: ReactNode; title: string; children: ReactNode | ((close: () => void) => ReactNode); triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = () => { setOpen(false); setDrag(0); opener.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    sheet.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button ref={opener} type="button" className={triggerClassName ?? "btn"} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>{trigger}</button>
      {open && (
        <div className="sheet-backdrop" onClick={close} data-testid="sheet-backdrop">
          <div
            ref={sheet}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            style={{ transform: `translateY(${drag}px)`, transition: start.current === null ? "transform .2s" : "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="sheet-handle-area"
              data-testid="sheet-handle"
              onPointerDown={(e) => { start.current = e.clientY; (e.target as Element).setPointerCapture?.(e.pointerId); }}
              onPointerMove={(e) => { if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current)); }}
              onPointerUp={() => { const d = drag; start.current = null; if (d > 80) close(); else setDrag(0); }}
              onPointerCancel={() => { start.current = null; setDrag(0); }}
            >
              <span className="sheet-handle" aria-hidden="true" />
            </div>
            <div className="sheet-head">
              <h2 id={titleId} className="sheet-title">{title}</h2>
              <button type="button" className="btn btn-text" onClick={close}>닫기</button>
            </div>
            <div className="sheet-body">{typeof children === "function" ? children(close) : children}</div>
          </div>
        </div>
      )}
    </>
  );
}
