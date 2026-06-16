// 한글(HWP)/PDF/문서 파일에서 "예산 자료"를 추출하는 헬퍼.
//
// 엑셀과 달리 HWP/PDF는 정형 행/열이 없으므로 텍스트를 뽑은 뒤 표를 추론한다.
//   1) 헤더 줄(사업명/예산현액 등 별칭을 2개 이상 포함)을 찾아 열 위치를 잡고
//   2) 이후 줄을 같은 열 구분으로 나눠 매핑한다.
//   3) 헤더를 못 찾으면 줄마다 "큰 숫자=예산현액, 그 앞=사업명"으로 추정한다.
// 결과는 항상 미리보기 화면에서 사람이 보정한 뒤 등록한다.

import { parseSheetRows } from './importXlsx';
import { extractText } from './extractText';
import { BUDGET_FIELDS } from './types';

export type BudgetDraft = {
  year: string;
  field: string;
  dept: string;
  program: string;
  budget: string; // 숫자 문자열 (천원)
  note: string;
};

const thisYear = String(new Date().getFullYear());

const ALIASES: Record<keyof Omit<BudgetDraft, never>, string[]> = {
  year: ['회계연도', '연도', 'year'],
  field: ['분야', '성질', 'field'],
  dept: ['소관부서', '부서', 'dept'],
  program: ['사업명', '세부사업', 'program'],
  budget: ['예산현액', '예산액', '예산', 'budget'],
  note: ['비고', 'note'],
};

export function emptyDraft(defaults?: { year?: string }): BudgetDraft {
  return {
    year: defaults?.year ?? thisYear,
    field: '정책사업',
    dept: '',
    program: '',
    budget: '',
    note: '',
  };
}

/** 콤마/공백/단위 등을 제거하고 숫자만 남긴다. */
function cleanNum(s: string): string {
  const digits = s.replace(/[^\d]/g, '');
  return digits;
}

/** 분야 셀 텍스트를 허용 분야로 보정 (없으면 '정책사업'). */
function matchBudgetField(v: string): string {
  const hit = BUDGET_FIELDS.find((f) => v.includes(f));
  return hit ?? '정책사업';
}

/** 한 줄을 탭 또는 2칸 이상 공백 기준으로 셀로 나눈다. */
function splitCells(line: string): string[] {
  return line
    .split(/\t+|\s{2,}|\s*[|｜]\s*/)
    .map((c) => c.trim())
    .filter((c) => c !== '');
}

function matchHeaderCell(cell: string): keyof BudgetDraft | null {
  const c = cell.replace(/\s+/g, '');
  for (const key of Object.keys(ALIASES) as (keyof BudgetDraft)[]) {
    if (ALIASES[key].some((a) => c.includes(a.replace(/\s+/g, '')))) return key;
  }
  return null;
}

function fallbackLine(line: string, defaults: { year: string }): BudgetDraft | null {
  // 콤마 포함 4자리 이상 숫자 덩어리를 예산현액 후보로 본다.
  const nums = line.match(/[\d,]{4,}/g);
  if (!nums) return null;
  const budgetRaw = nums[nums.length - 1];
  const budget = cleanNum(budgetRaw);
  if (!budget) return null;

  const d = emptyDraft(defaults);
  let rest = line.slice(0, line.lastIndexOf(budgetRaw)).trim();

  const ym = rest.match(/(19|20)\d{2}/);
  if (ym) {
    d.year = ym[0];
    rest = rest.replace(ym[0], '').trim();
  }
  const f = BUDGET_FIELDS.find((bf) => rest.includes(bf));
  if (f) {
    d.field = f;
    rest = rest.replace(f, '').trim();
  }
  d.program = rest.replace(/^[\s\-|·•．.]+/, '').trim();
  d.budget = budget;
  return d.program ? d : null;
}

/** 추출된 평문 텍스트에서 예산 행을 추론한다. */
export function parseBudgetText(text: string, defaults: { year: string }): BudgetDraft[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1) 헤더 줄 탐색
  let headerIdx = -1;
  let colMap: (keyof BudgetDraft | null)[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCells(lines[i]);
    if (cells.length < 2) continue;
    const mapped = cells.map(matchHeaderCell);
    const hits = mapped.filter(Boolean).length;
    if (hits >= 2 && mapped.includes('program')) {
      headerIdx = i;
      colMap = mapped;
      break;
    }
  }

  const drafts: BudgetDraft[] = [];

  if (headerIdx >= 0) {
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = splitCells(lines[i]);
      if (cells.length < 2) continue;
      const d = emptyDraft(defaults);
      let any = false;
      colMap.forEach((key, idx) => {
        if (!key) return;
        const v = (cells[idx] ?? '').trim();
        if (!v) return;
        if (key === 'budget') d.budget = cleanNum(v);
        else if (key === 'field') d.field = matchBudgetField(v);
        else if (key === 'year') {
          const y = v.match(/(19|20)\d{2}/);
          if (y) d.year = y[0];
        } else d[key] = v;
        any = true;
      });
      if (any && d.program.trim()) drafts.push(d);
    }
    if (drafts.length) return drafts;
  }

  // 2) 헤더를 못 찾았거나 데이터가 없으면 줄 단위 추정
  for (const line of lines) {
    const d = fallbackLine(line, defaults);
    if (d) drafts.push(d);
  }
  return drafts;
}

/** 엑셀 시트 rows(객체)를 draft로 매핑. */
function rowsToDrafts(
  rows: Record<string, unknown>[],
  defaults: { year: string }
): BudgetDraft[] {
  const drafts: BudgetDraft[] = [];
  for (const row of rows) {
    const keys = Object.keys(row);
    const pick = (aliases: string[]): string => {
      for (const a of aliases) {
        const k = keys.find((kk) => kk.replace(/\s+/g, '') === a.replace(/\s+/g, ''));
        if (k != null) {
          const v = row[k];
          if (v != null && String(v).trim() !== '') return String(v).trim();
        }
      }
      return '';
    };
    const program = pick(ALIASES.program);
    if (!program) continue;
    const d = emptyDraft(defaults);
    const yv = pick(ALIASES.year);
    if (yv) {
      const y = yv.match(/(19|20)\d{2}/);
      if (y) d.year = y[0];
    }
    const fv = pick(ALIASES.field);
    if (fv) d.field = matchBudgetField(fv);
    d.dept = pick(ALIASES.dept);
    d.program = program;
    d.budget = cleanNum(pick(ALIASES.budget));
    d.note = pick(ALIASES.note);
    drafts.push(d);
  }
  return drafts;
}

export type ExtractBudgetResult = {
  drafts: BudgetDraft[];
  rawText: string;
  ext: string;
  supported: boolean;
};

/**
 * 업로드 파일 하나에서 예산 draft 목록을 추출한다.
 *   - xlsx/xls/csv: 시트를 정형 파싱
 *   - pdf/hwp/docx/txt 등: 텍스트 추출 후 표 추론
 */
export async function extractBudgetDrafts(
  file: File,
  defaults: { year: string }
): Promise<ExtractBudgetResult> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    const rows = await parseSheetRows(file);
    return { drafts: rowsToDrafts(rows, defaults), rawText: '', ext, supported: true };
  }

  const { text, supported } = await extractText(file);
  const drafts = supported && text ? parseBudgetText(text, defaults) : [];
  return { drafts, rawText: text, ext, supported };
}
