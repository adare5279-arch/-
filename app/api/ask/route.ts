// 최소 풀스택 데모용 백엔드 라우트
// 흐름: 프론트(질문) → 백엔드(검증·rate limit·DB 관련자료 검색) → Claude(AI) → 결과+근거 반환
import { supabaseServer } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── 아주 단순한 메모리 기반 rate limit (인스턴스 단위) ─────────────────
const WINDOW_MS = 60_000; // 1분
const MAX_HITS = 10; // 1분당 10회
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 500) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return arr.length > MAX_HITS;
}

// ── 질문에서 검색 키워드 추출 ─────────────────────────────────────────
const STOP = new Set([
  '그리고', '그러나', '대한', '대해', '관련', '무엇', '어떤', '어떻게', '정리', '알려',
  '우리', '해줘', '해주세요', '있는', '하는', '부서', '내용', '대해서', '경우', '관해',
  '리스트', '목록', '현황', '상태', '무슨', '뭐가', '뭔지',
]);

function keywords(q: string): string[] {
  return Array.from(
    new Set(
      (q.match(/[가-힣A-Za-z0-9]+/g) ?? [])
        .map((w) => w.trim())
        .filter((w) => w.length >= 2 && !STOP.has(w)),
    ),
  ).slice(0, 8);
}

// ilike 다중 OR 필터 문자열.
// supabase-js .or() 안에서는 와일드카드로 '*'를 사용한다('%' 아님).
function ilikeOr(col: string, kws: string[]): string {
  return kws.map((k) => `${col}.ilike.*${k.replace(/[%*,().]/g, ' ')}*`).join(',');
}

function clip(s: string, n = 140): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export type Source = {
  source: string;
  label: string;
  snippet: string;
  table?: 'issues' | 'material_requests' | 'witnesses' | 'meeting_minutes';
  id?: number;
};

// ── DB에서 질문과 관련된 자료를 골라온다 (지적사항·자료요구·증인) ────────
async function retrieve(
  committee: string,
  question: string,
): Promise<{ context: string; sources: Source[] }> {
  const kws = keywords(question);
  const sources: Source[] = [];
  const ctx: string[] = [];

  // 1) 지적사항 — content 키워드 매칭, 없으면 최신
  {
    let q = supabaseServer
      .from('issues')
      .select('id, dept, type, content, proc')
      .eq('committee', committee);
    if (kws.length) q = q.or(ilikeOr('content', kws));
    let { data } = await q.order('created_at', { ascending: false }).limit(6);
    if ((!data || data.length === 0) && kws.length) {
      const fb = await supabaseServer
        .from('issues')
        .select('id, dept, type, content, proc')
        .eq('committee', committee)
        .order('created_at', { ascending: false })
        .limit(4);
      data = fb.data;
    }
    const rows = (data ?? []) as Array<{ id: number; dept: string | null; type: string; content: string; proc: string }>;
    if (rows.length) {
      ctx.push('[지적사항]');
      for (const r of rows) {
        ctx.push(`- (${r.dept ?? '부서미상'}/${r.type}/${r.proc}) ${r.content}`);
        sources.push({
          source: '지적사항',
          label: `${r.dept ?? '부서미상'} · ${r.proc}`,
          snippet: clip(r.content),
          table: 'issues',
          id: r.id,
        });
      }
    }
  }

  // 2) 자료요구 — title 키워드 매칭, 없으면 최신
  {
    let q = supabaseServer
      .from('material_requests')
      .select('id, dept, title, status')
      .eq('committee', committee);
    if (kws.length) q = q.or(ilikeOr('title', kws));
    let { data } = await q.order('created_at', { ascending: false }).limit(6);
    if ((!data || data.length === 0) && kws.length) {
      const fb = await supabaseServer
        .from('material_requests')
        .select('id, dept, title, status')
        .eq('committee', committee)
        .order('created_at', { ascending: false })
        .limit(4);
      data = fb.data;
    }
    const rows = (data ?? []) as Array<{ id: number; dept: string | null; title: string; status: string }>;
    if (rows.length) {
      ctx.push('', '[자료요구]');
      for (const r of rows) {
        ctx.push(`- (${r.dept ?? '부서미상'}/${r.status}) ${r.title}`);
        sources.push({
          source: '자료요구',
          label: `${r.dept ?? '부서미상'} · ${r.status}`,
          snippet: clip(r.title),
          table: 'material_requests',
          id: r.id,
        });
      }
    }
  }

  // 3) 증인·참고인 — 키워드가 있을 때만 (이름/기관/비고)
  if (kws.length) {
    const q = supabaseServer
      .from('witnesses')
      .select('id, kind, name, org, pos, attend, note')
      .eq('committee', committee)
      .or(`${ilikeOr('name', kws)},${ilikeOr('org', kws)},${ilikeOr('note', kws)}`);
    const { data } = await q.limit(4);
    const rows = (data ?? []) as Array<{
      id: number; kind: string; name: string; org: string | null; pos: string | null; attend: string; note: string | null;
    }>;
    if (rows.length) {
      ctx.push('', '[증인·참고인]');
      for (const r of rows) {
        ctx.push(`- (${r.kind}/${r.attend}) ${r.name} ${r.org ?? ''} ${r.pos ?? ''} ${r.note ?? ''}`.trim());
        sources.push({
          source: '증인·참고인',
          label: `${r.name} · ${r.attend}`,
          snippet: clip(`${r.org ?? ''} ${r.pos ?? ''} ${r.note ?? ''}`),
          table: 'witnesses',
          id: r.id,
        });
      }
    }
  }

  // 4) 회의록 발언 — 발언자·요약 키워드 매칭 (해당 위원회 회의로 한정)
  if (kws.length) {
    const { data: mlist } = await supabaseServer
      .from('meetings')
      .select('id, date')
      .eq('committee', committee);
    const meetings = (mlist ?? []) as Array<{ id: number; date: string | null }>;
    if (meetings.length) {
      const ids = meetings.map((m) => m.id);
      const dateById = new Map(meetings.map((m) => [m.id, m.date ?? '']));
      const { data } = await supabaseServer
        .from('meeting_statements')
        .select('id, meeting_id, speaker, role, summary')
        .in('meeting_id', ids)
        .or(`${ilikeOr('speaker', kws)},${ilikeOr('summary', kws)}`)
        .limit(5);
      const rows = (data ?? []) as Array<{
        id: number; meeting_id: number; speaker: string; role: string | null; summary: string | null;
      }>;
      if (rows.length) {
        ctx.push('', '[회의록 발언]');
        for (const r of rows) {
          const d = dateById.get(r.meeting_id) ?? '';
          ctx.push(
            `- (${d} ${r.speaker}${r.role ? `/${r.role}` : ''}) ${r.summary ?? ''}`.trim(),
          );
          sources.push({
            source: '회의록',
            label: `${d}${d ? ' · ' : ''}${r.speaker}${r.role ? ` (${r.role})` : ''}`,
            snippet: clip(r.summary ?? ''),
            table: 'meeting_minutes',
            id: r.meeting_id,
          });
        }
      }
    }
  }

  return { context: ctx.join('\n').slice(0, 7000), sources };
}

export async function POST(request: Request): Promise<Response> {
  try {
    // 0) rate limit
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    if (rateLimited(ip)) {
      return Response.json(
        { error: '요청이 너무 잦습니다. 잠시 후 다시 시도하세요. (1분당 10회)' },
        { status: 429 },
      );
    }

    // 1) 입력 검증
    const body = (await request.json()) as {
      question?: string;
      apiKey?: string;
      committee?: string;
      useData?: boolean;
    };
    const question = (body.question ?? '').trim();
    if (!question) return Response.json({ error: '질문을 입력하세요.' }, { status: 400 });
    if (question.length > 2000)
      return Response.json({ error: '질문은 2000자 이내로 입력하세요.' }, { status: 400 });

    // 2) 키 확보
    const key = body.apiKey?.trim() || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return Response.json(
        { error: 'AI 키가 없습니다. 개인 API 키를 입력하거나 서버에 ANTHROPIC_API_KEY를 설정하세요.' },
        { status: 400 },
      );
    }

    // 3) DB에서 질문 관련 자료 검색 (선택)
    let context = '';
    let sources: Source[] = [];
    const committee = (body.committee ?? '').trim();
    if (body.useData && committee) {
      try {
        const r = await retrieve(committee, question);
        context = r.context;
        sources = r.sources;
      } catch (e) {
        console.error('[ask] retrieve error:', e);
      }
    }

    // 4) 로깅
    console.log(
      `[ask] ${new Date().toISOString()} ip=${ip} q.len=${question.length} ` +
        `key=${body.apiKey ? 'user' : 'server'} data=${context ? `on(${committee},src=${sources.length})` : 'off'}`,
    );

    // 5) AI 처리 (스트리밍)
    const system =
      '당신은 대한민국 지방의회(경기도의회) 행정사무감사를 돕는 보조자입니다. ' +
      '질문에 정확하고 간결하게, 공무원이 이해하기 쉬운 한국어로 답하세요. ' +
      (context
        ? '아래 [참고 자료]는 이 질문과 관련해 데이터베이스에서 검색한 해당 위원회의 실제 감사 데이터입니다. ' +
          '관련 있는 항목을 근거로 활용하되, 자료에 없는 사실을 지어내지 마세요. ' +
          '근거로 삼은 자료의 부서·상태를 답변에 함께 언급하세요.\n\n[참고 자료]\n' + context
        : '');

    const usedData = Boolean(context);

    // NDJSON 스트림으로 응답: 줄 단위 JSON
    //  {type:'sources', sources}  → 근거 먼저
    //  {type:'delta', text}       → 토큰 조각 (반복)
    //  {type:'done', usedData}    → 종료
    //  {type:'error', error}      → 오류
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        try {
          send({ type: 'sources', sources });

          const ares = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-5',
              max_tokens: 1024,
              temperature: 0.4,
              system,
              stream: true,
              messages: [{ role: 'user', content: question }],
            }),
          });

          if (!ares.ok || !ares.body) {
            const errText = (await ares.text()).slice(0, 300);
            send({ type: 'error', error: `AI 처리 오류: ${ares.status} ${errText}` });
            controller.close();
            return;
          }

          // Anthropic SSE 파싱 → text_delta만 추출
          const reader = ares.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              try {
                const evt = JSON.parse(payload) as {
                  type?: string;
                  delta?: { type?: string; text?: string };
                };
                if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                  send({ type: 'delta', text: evt.delta.text ?? '' });
                }
              } catch {
                /* SSE 비-JSON 라인 무시 */
              }
            }
          }

          send({ type: 'done', usedData });
        } catch (e) {
          send({ type: 'error', error: String(e) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
