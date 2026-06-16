import { supabaseServer } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 일반 자료의 "쓰기"(insert/update/delete/upsert)를 한 번 거쳐가는 백엔드 게이트웨이.
// 목적: ① 입력 검증(허용 테이블·필수값) ② 변경 로깅 ③ 위험 작업 차단(조건 없는 전체 삭제 등).
// 조회(select)는 성능을 위해 프런트에서 supabase로 직접 한다. 여기서는 쓰기만 처리한다.
// 로그인/권한 게이트는 두지 않으므로 누구나 기존과 동일하게 사용할 수 있다.

// 쓰기를 허용하는 테이블 화이트리스트 (이 목록에 없는 테이블은 거부)
const ALLOWED_TABLES = new Set<string>([
  'material_requests',
  'issues',
  'witnesses',
  'meeting_minutes',
  'meeting_statements',
  'schedule_events',
  'departments',
  'report_sections',
  'members',
  'demo_qa',
  'budget_items',
  'fiscal_indicators',
]);

type Action = 'insert' | 'update' | 'delete' | 'upsert';
const ALLOWED_ACTIONS: Action[] = ['insert', 'update', 'delete', 'upsert'];

type Body = {
  table?: string;
  action?: Action;
  payload?: unknown;
  match?: Record<string, unknown>;
  onConflict?: string;
};

function bad(error: string, status = 400): Response {
  return Response.json({ data: null, error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad('요청 본문(JSON)을 해석할 수 없습니다.');
  }

  const { table, action, payload, match, onConflict } = body;

  // 1) 테이블 검증
  if (!table || !ALLOWED_TABLES.has(table)) {
    return bad(`허용되지 않은 테이블입니다: ${table ?? '(없음)'}`);
  }
  // 2) 작업 검증
  if (!action || !ALLOWED_ACTIONS.includes(action)) {
    return bad(`허용되지 않은 작업입니다: ${action ?? '(없음)'}`);
  }
  // 3) 작업별 필수값 검증
  if ((action === 'insert' || action === 'upsert') && payload == null) {
    return bad('저장할 데이터(payload)가 없습니다.');
  }
  if (action === 'update') {
    if (payload == null) return bad('수정할 내용(payload)이 없습니다.');
    if (!match || Object.keys(match).length === 0)
      return bad('수정 대상을 지정하는 조건(match)이 필요합니다.');
  }
  if (action === 'delete' && (!match || Object.keys(match).length === 0)) {
    // 조건 없는 delete = 테이블 전체 삭제 → 사고 방지를 위해 차단
    return bad('삭제 대상을 지정하는 조건(match)이 필요합니다. (전체 삭제 차단)');
  }

  const rowCount = Array.isArray(payload) ? payload.length : payload ? 1 : 0;
  const logHead = `[data-api] ${new Date().toISOString()} ${action.toUpperCase()} ${table}`;

  try {
    let resData: unknown = null;
    let resError: { message?: string } | null = null;

    if (action === 'insert') {
      const r = await supabaseServer.from(table).insert(payload as never);
      resData = r.data;
      resError = r.error;
    } else if (action === 'upsert') {
      const r = await supabaseServer
        .from(table)
        .upsert(payload as never, onConflict ? { onConflict } : undefined);
      resData = r.data;
      resError = r.error;
    } else if (action === 'update') {
      let q = supabaseServer.from(table).update(payload as never);
      for (const [k, v] of Object.entries(match!)) q = q.eq(k, v as never);
      const r = await q;
      resData = r.data;
      resError = r.error;
    } else {
      // delete
      let q = supabaseServer.from(table).delete();
      for (const [k, v] of Object.entries(match!)) q = q.eq(k, v as never);
      const r = await q;
      resData = r.data;
      resError = r.error;
    }

    if (resError) {
      console.error(`${logHead} 실패:`, resError.message ?? resError);
      return bad(resError.message ?? '데이터베이스 오류', 400);
    }

    console.log(
      `${logHead} 성공 (행=${rowCount}${match ? `, 조건=${JSON.stringify(match)}` : ''})`,
    );
    return Response.json({ data: resData, error: null });
  } catch (e) {
    console.error(`${logHead} 예외:`, e);
    return bad(String(e), 500);
  }
}
