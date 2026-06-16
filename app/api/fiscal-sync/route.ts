import { supabaseServer } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 지방재정365 재정지표 자동연동.
//
// ⚠️ 출처에 대한 중요한 사실:
//   공공데이터포털(data.go.kr)의 "지방재정365" 데이터셋(재정자립도/재정자주도 등)은
//   대부분 "LINK형" API라 서버가 조회할 수 있는 JSON/XML 데이터를 직접 주지 않고
//   lofin365 포털 페이지로 연결만 한다. 따라서 기계 판독이 가능한 실제 출처로는
//   동일 지표를 JSON으로 제공하는 KOSIS(국가통계포털) OpenAPI를 사용한다.
//
// 인증키: 환경변수 KOSIS_API_KEY (서버 전용, 브라우저 비노출).
//   무료 발급: https://kosis.kr/openapi/  (활용신청 → 인증키)
//
// 표/항목 코드는 통계표마다 다르므로 환경변수로 재정의할 수 있게 했다.
// 첫 연동 시에는 body { preview: true } 로 원본 응답을 확인해 코드를 맞춘 뒤
// preview 없이 호출하면 fiscal_indicators 에 upsert 된다.

const KOSIS_BASE = 'https://kosis.kr/openapi/Param/statisticsParameterData.do';
const ORG_NAME = '경기도';
const SOURCE_URL = 'https://www.lofin365.go.kr/portal/LF3140101.do';

type Spec = {
  col: 'fin_independence' | 'fin_autonomy';
  label: string;
  orgId: string;
  tblId: string;
  itmId: string;
  objL1: string;
};

// 기본값은 시도별 재정자립도/재정자주도 통계표. 통계표 개편 시 ENV로 교체 가능.
const SPECS: Spec[] = [
  {
    col: 'fin_independence',
    label: '재정자립도',
    orgId: process.env.KOSIS_ORG_INDEP || '101',
    tblId: process.env.KOSIS_TBL_INDEP || 'DT_1YL20921',
    itmId: process.env.KOSIS_ITM_INDEP || 'ALL',
    objL1: process.env.KOSIS_OBJL1_INDEP || 'ALL',
  },
  {
    col: 'fin_autonomy',
    label: '재정자주도',
    orgId: process.env.KOSIS_ORG_AUTO || '101',
    tblId: process.env.KOSIS_TBL_AUTO || 'DT_1YL20951',
    itmId: process.env.KOSIS_ITM_AUTO || 'ALL',
    objL1: process.env.KOSIS_OBJL1_AUTO || 'ALL',
  },
];

type KosisRow = {
  PRD_DE?: string;
  C1_NM?: string;
  C2_NM?: string;
  ITM_NM?: string;
  DT?: string;
  UNIT_NM?: string;
  [k: string]: unknown;
};

function bad(error: string, status = 400, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, error, ...extra }, { status });
}

function buildUrl(spec: Spec, key: string, years: number): string {
  const p = new URLSearchParams({
    method: 'getList',
    apiKey: key,
    orgId: spec.orgId,
    tblId: spec.tblId,
    itmId: spec.itmId,
    objL1: spec.objL1,
    objL2: '',
    objL3: '',
    format: 'json',
    jsonVD: 'Y',
    prdSe: 'Y',
    newEstPrdCnt: String(years),
    prdInterval: '1',
  });
  return `${KOSIS_BASE}?${p.toString()}`;
}

export async function POST(request: Request): Promise<Response> {
  const key = process.env.KOSIS_API_KEY;
  if (!key) {
    return bad(
      'KOSIS_API_KEY가 설정되지 않았습니다. KOSIS(국가통계포털) OpenAPI 인증키를 서버 환경변수에 등록해 주세요.',
      400,
      { help: 'https://kosis.kr/openapi/' }
    );
  }

  let body: { preview?: boolean; years?: number; region?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* 본문 없으면 기본값 사용 */
  }
  const years = Math.min(20, Math.max(1, Number(body.years) || 6));
  const region = (body.region || ORG_NAME).replace(/도$|특별자치도$/, ''); // '경기'로 매칭
  const preview = body.preview === true;

  // 연도별로 모은 패치: { 2023: { fin_independence: 61.2 }, ... }
  const byYear = new Map<number, Record<string, number>>();
  const diagnostics: Record<string, unknown>[] = [];

  for (const spec of SPECS) {
    const url = buildUrl(spec, key, years);
    const safeUrl = url.replace(encodeURIComponent(key), '***').replace(key, '***');
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        diagnostics.push({ indicator: spec.label, url: safeUrl, error: '응답이 JSON이 아님', raw: text.slice(0, 400) });
        continue;
      }

      // KOSIS 오류 응답: { err: '...', errMsg: '...' }
      if (!Array.isArray(json)) {
        diagnostics.push({ indicator: spec.label, url: safeUrl, apiResponse: json });
        continue;
      }

      const rows = json as KosisRow[];
      const matched = rows.filter((r) => (r.C1_NM ?? '').includes(region));
      diagnostics.push({
        indicator: spec.label,
        url: safeUrl,
        totalRows: rows.length,
        matchedRows: matched.length,
        sample: rows.slice(0, 2),
        matchedSample: matched.slice(0, 3),
      });

      for (const r of matched) {
        const year = Number(r.PRD_DE);
        const val = Number(r.DT);
        if (!Number.isFinite(year) || !Number.isFinite(val)) continue;
        const patch = byYear.get(year) ?? {};
        // 같은 연도·지표가 여러 행이면 마지막 값으로 (보통 1행)
        patch[spec.col] = val;
        byYear.set(year, patch);
      }
    } catch (e) {
      diagnostics.push({ indicator: spec.label, url: safeUrl, error: String(e) });
    }
  }

  const planned = Array.from(byYear.entries())
    .map(([year, patch]) => ({ year, ...patch }))
    .sort((a, b) => b.year - a.year);

  // preview 모드: 쓰지 않고 진단·계획만 반환 (첫 연동 시 코드 검증용)
  if (preview) {
    return Response.json({ ok: true, preview: true, planned, diagnostics });
  }

  if (planned.length === 0) {
    return bad(
      '연동할 데이터를 찾지 못했습니다. preview 모드로 응답을 확인하고 통계표/항목 코드(KOSIS_TBL_*, KOSIS_ITM_*)를 조정해 주세요.',
      422,
      { diagnostics }
    );
  }

  // upsert: 제공하는 컬럼만 갱신하고 수기 입력값(통합재정수지비율 등)은 보존.
  let upserted = 0;
  const errors: string[] = [];
  for (const row of planned) {
    const payload = {
      org_name: ORG_NAME,
      year: row.year,
      ...('fin_independence' in row ? { fin_independence: row.fin_independence } : {}),
      ...('fin_autonomy' in row ? { fin_autonomy: row.fin_autonomy } : {}),
      source_url: SOURCE_URL,
    };
    const { error } = await supabaseServer
      .from('fiscal_indicators')
      .upsert(payload, { onConflict: 'org_name,year' });
    if (error) errors.push(`${row.year}: ${error.message}`);
    else upserted++;
  }

  return Response.json({
    ok: errors.length === 0,
    upserted,
    years: planned.map((p) => p.year),
    errors: errors.length ? errors : undefined,
  });
}
