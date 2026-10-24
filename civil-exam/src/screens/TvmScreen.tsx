import { useState } from 'react';
import { RichText } from '../components/RichText';
import { tvmFactors } from '../solvers';

const ROWS = [
  { key: 'fvLump', name: '일시불의 내가계수', tex: '(1 + r)^n', use: '지금 금액 → n기 후 미래가치', on: 'amount' },
  { key: 'pvLump', name: '일시불의 현가계수', tex: '\\dfrac{1}{(1 + r)^n}', use: 'n기 후 금액 → 현재가치', on: 'amount' },
  { key: 'fvAnnuity', name: '연금의 내가계수', tex: '\\dfrac{(1 + r)^n - 1}{r}', use: '매기 적립액 → n기 후 적립 총액', on: 'payment' },
  { key: 'pvAnnuity', name: '연금의 현가계수', tex: '\\dfrac{1 - (1 + r)^{-n}}{r}', use: '매기 수령액 → 현재가치(저당상수의 역수)', on: 'payment' },
  { key: 'sinkingFund', name: '감채기금계수', tex: '\\dfrac{r}{(1 + r)^n - 1}', use: 'n기 후 목표액 → 매기 적립액(연금 내가계수의 역수)', on: 'amount' },
  { key: 'mortgageConstant', name: '저당상수', tex: '\\dfrac{r}{1 - (1 + r)^{-n}}', use: '대출원금 → 매기 원리금 상환액', on: 'amount' },
] as const;

const fmt = (x: number, d = 4) => (Number.isFinite(x) ? x.toLocaleString('ko-KR', { maximumFractionDigits: d }) : '—');

/** 화폐의 시간가치 6계수 계산기(부동산학원론 2차): 이자율·기간을 넣으면 계수와 금액 적용값을 보여 준다 */
export function TvmScreen({ onHome }: { onHome: () => void }) {
  const [rate, setRate] = useState('5');
  const [n, setN] = useState('10');
  const [amount, setAmount] = useState('100000000');
  const [payment, setPayment] = useState('1000000');
  const r = Number(rate) / 100;
  const periods = Math.round(Number(n));
  const ok = Number.isFinite(r) && r > -1 && periods > 0 && periods <= 600;
  const f = ok ? tvmFactors(r, periods) : null;
  const money = { amount: Number(amount), payment: Number(payment) };

  const field = (label: string, value: string, set: (v: string) => void, suffix: string) => (
    <label className="tvm-field">
      <span>{label}</span>
      <input inputMode="decimal" value={value} onChange={(e) => set(e.target.value.replace(/[^\d.-]/g, ''))} />
      <span className="muted small">{suffix}</span>
    </label>
  );

  return (
    <div className="result">
      <header className="topbar">
        <div className="topbar-title">
          <strong>화폐의 시간가치 6계수</strong>
          <span className="topbar-sub">부동산학원론 · 기간 이자율 r, 기간 수 n</span>
        </div>
        <button type="button" className="btn" onClick={onHome}>
          홈으로
        </button>
      </header>
      <main className="home-main">
        <section className="card tvm-inputs">
          {field('이자율', rate, setRate, '% (기간당)')}
          {field('기간', n, setN, '기')}
          {field('일시불 금액', amount, setAmount, '원')}
          {field('매기 금액', payment, setPayment, '원')}
        </section>
        {!ok && <p className="notice notice-error">이자율과 기간(1~600)을 확인하세요.</p>}
        {f && (
          <section className="card">
            <table className="history tvm-table">
              <thead>
                <tr>
                  <th scope="col" className="tvm-col-name">계수</th>
                  <th scope="col">값</th>
                  <th scope="col">금액 적용</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">
                      {row.name}
                      <span className="tvm-tex">
                        <RichText text={`$${row.tex}$`} />
                      </span>
                      <span className="muted small">{row.use}</span>
                    </th>
                    <td>{fmt(f[row.key], 6)}</td>
                    <td>
                      {fmt(f[row.key] * money[row.on], 0)}
                      <span className="muted small">{row.on === 'amount' ? '일시불' : '매기'} 금액 기준</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">
              짝: 일시불 내가 ↔ 현가, 연금 내가 ↔ 감채기금, 연금 현가 ↔ 저당상수는 서로 역수이다. 월 단위 상환이면 연 이자율 ÷ 12, 기간 ×
              12로 넣는다.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
