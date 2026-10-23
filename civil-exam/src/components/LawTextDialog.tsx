import { useEffect, useRef } from 'react';
import { formatAsOf, lawGoKrUrl } from '../lib/law';
import { lookupCite } from '../lib/lawtexts';

type Props = { cite: string | null; onClose: () => void };

/** 근거 조문 원문 팝업: law-texts/*.json 에 넣어 둔 조문, 없으면 국가법령정보센터 링크 */
export function LawTextDialog({ cite, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (cite && !d.open) d.showModal();
    if (!cite && d.open) d.close();
  }, [cite]);

  const found = cite ? lookupCite(cite) : null;
  const hit = found?.hit;
  const url = found?.parsed ? lawGoKrUrl(found.parsed) : null;
  const paragraphs = hit?.text.split(/\n+/).filter(Boolean) ?? [];

  return (
    <dialog
      ref={ref}
      className="dlg law-dlg"
      aria-labelledby="law-dlg-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <h2 id="law-dlg-title">{cite}</h2>
      {hit ? (
        <>
          <p className="law-dlg-head">
            <strong>
              {hit.article}
              {hit.title && `(${hit.title})`}
            </strong>
            {hit.file.asOf && <span className="tag tag-asof">{formatAsOf(hit.file.asOf)} 현행</span>}
          </p>
          <div className="law-dlg-text">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {found?.parsed?.rest && <p className="muted small">해설이 가리키는 부분: {found.parsed.rest}</p>}
        </>
      ) : (
        <p className="muted">
          이 조문의 원문이 아직 앱에 없습니다. <code>law-texts/</code> 폴더에 조문 JSON을 넣거나 <code>npm run fetch-law</code>로
          받아 두면 오프라인에서도 여기에 표시됩니다.
        </p>
      )}
      <div className="dlg-actions">
        {url && (
          <a className="btn" href={url} target="_blank" rel="noreferrer">
            국가법령정보센터에서 보기
          </a>
        )}
        <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
          닫기
        </button>
      </div>
    </dialog>
  );
}
