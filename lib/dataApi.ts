// 일반 자료의 "쓰기"(insert/update/delete/upsert)를 백엔드 게이트웨이(/api/data)로
// 보내는 클라이언트 헬퍼. 서버에서 검증·로깅을 거친 뒤 Supabase에 반영된다.
// 조회(select)는 성능을 위해 기존처럼 supabase 클라이언트로 직접 한다.
//
// 반환 형태는 supabase와 동일하게 { data, error } 라서 기존 호출부의
// `const { error } = await ...` 패턴을 그대로 쓸 수 있다.

export type WriteResult<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
};

async function postData(payload: unknown): Promise<WriteResult> {
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { data: unknown; error: string | null };
    if (!res.ok || json.error) {
      return { data: null, error: { message: json.error ?? `요청 실패(${res.status})` } };
    }
    return { data: json.data, error: null };
  } catch (e) {
    return { data: null, error: { message: String(e) } };
  }
}

/** 한 건 또는 여러 건 추가 */
export function insertRows(table: string, payload: unknown): Promise<WriteResult> {
  return postData({ table, action: 'insert', payload });
}

/** match 조건에 해당하는 행을 수정 (예: { id }) */
export function updateRows(
  table: string,
  payload: unknown,
  match: Record<string, unknown>,
): Promise<WriteResult> {
  return postData({ table, action: 'update', payload, match });
}

/** match 조건에 해당하는 행을 삭제 (조건 필수 — 전체 삭제 차단) */
export function deleteRows(
  table: string,
  match: Record<string, unknown>,
): Promise<WriteResult> {
  return postData({ table, action: 'delete', match });
}

/** upsert (onConflict 기준 충돌 시 갱신) */
export function upsertRows(
  table: string,
  payload: unknown,
  opts?: { onConflict?: string },
): Promise<WriteResult> {
  return postData({ table, action: 'upsert', payload, onConflict: opts?.onConflict });
}
