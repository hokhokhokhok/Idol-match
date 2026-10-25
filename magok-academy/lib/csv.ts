// RFC 4180 CSV 파서. 따옴표로 감싼 칸 안의 쉼표·줄바꿈·"" 이스케이프, BOM, CRLF를 처리한다.
// 엑셀·구글시트에서 내보낸 파일을 그대로 읽기 위해 외부 의존성 없이 직접 구현.

export interface CsvTable {
  header: string[];
  /** 헤더 이름 → 값. 헤더보다 칸이 적으면 빈 문자열로 채운다. */
  rows: { line: number; values: Record<string, string> }[];
}

export function parseCsvRows(text: string): { line: number; cells: string[] }[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  const endRow = () => {
    cells.push(cell);
    // 완전히 빈 줄은 건너뛴다
    if (!(cells.length === 1 && cells[0] === "")) out.push({ line: rowLine, cells });
    cells = [];
    cell = "";
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else if (ch === "\r") {
      // CRLF의 \r은 무시, 단독 \r은 줄바꿈으로
      if (src[i + 1] !== "\n") {
        endRow();
        rowLine = ++line;
      }
    } else if (ch === "\n") {
      endRow();
      rowLine = ++line;
    } else {
      cell += ch;
    }
  }
  if (inQuotes) throw new Error(`CSV ${rowLine}행: 닫히지 않은 따옴표`);
  if (cell !== "" || cells.length > 0) endRow();
  return out;
}

export function parseCsv(text: string): CsvTable {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { header: [], rows: [] };
  const header = rows[0].cells.map((h) => h.trim());
  return {
    header,
    rows: rows.slice(1).map(({ line, cells }) => {
      const values: Record<string, string> = {};
      header.forEach((h, i) => {
        values[h] = (cells[i] ?? "").trim();
      });
      return { line, values };
    }),
  };
}

/** 세미콜론 배열 구분자: "보컬;연기" → ["보컬", "연기"], 빈 값 → [] */
export function splitList(value: string): string[] {
  return value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 칸 하나를 CSV용으로: 쉼표·따옴표·줄바꿈이 있으면 큰따옴표로 감싼다. */
export function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) || value !== value.trim() ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(header: readonly string[], rows: Record<string, string>[]): string {
  const lines = [header.map(escapeCell).join(",")];
  for (const r of rows) lines.push(header.map((h) => escapeCell(r[h] ?? "")).join(","));
  return lines.join("\n") + "\n";
}
