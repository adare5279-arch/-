// Supabase 조회(GET /rest/v1) 응답을 짧게 캐시하는 fetch 래퍼.
//
// 이 앱은 화면마다 위원회 기준으로 같은 목록을 반복 조회한다. 화면을 오갈 때마다
// 매번 왕복하면 이미 본 화면도 다시 "불러오는 중..."을 거치게 되므로,
// 같은 질의는 짧은 TTL 동안 재사용하고 동시에 뜬 같은 요청은 하나로 합친다.
//
// 정확성은 무효화로 지킨다.
//  - 쓰기(dataApi)가 성공하면 해당 테이블 캐시를 즉시 버린다.
//  - 다른 사용자의 변경(useRealtimeSync)이 오면 해당 테이블 캐시를 버린다.
// 따라서 캐시가 살아있는 구간에도 오래된 값이 화면에 남지 않는다.

const TTL_MS = 30_000;

type Entry = {
  at: number;
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
};

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Response>>();

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

// 같은 URL이라도 Range/Prefer(count 질의 등)에 따라 응답이 다르므로 키에 포함한다.
function keyOf(url: string, input: RequestInfo | URL, init?: RequestInit): string {
  const h = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  return `${url}|${h.get('range') ?? ''}|${h.get('prefer') ?? ''}`;
}

function toResponse(e: Entry): Response {
  return new Response(e.body, {
    status: e.status,
    statusText: e.statusText,
    headers: new Headers(e.headers),
  });
}

/** 테이블 하나(또는 전체)의 캐시를 버린다. */
export function invalidateQueryCache(table?: string): void {
  if (!table) {
    cache.clear();
    return;
  }
  const needle = `/rest/v1/${table}`;
  for (const k of [...cache.keys()]) {
    if (k.includes(needle)) cache.delete(k);
  }
}

export function cachedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = urlOf(input);
  const method = methodOf(input, init);

  // 조회(GET)만 캐시한다. 쓰기·HEAD(count)·스토리지 요청은 그대로 통과.
  if (method !== 'GET' || !url.includes('/rest/v1/')) {
    return fetch(input, init);
  }

  const key = keyOf(url, input, init);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return Promise.resolve(toResponse(hit));
  }

  const pending = inflight.get(key);
  if (pending) return pending.then((r) => r.clone());

  const p = fetch(input, init)
    .then(async (res) => {
      // 성공 응답만 저장한다. 실패는 캐시해봐야 재시도를 막을 뿐이다.
      if (res.ok) {
        const clone = res.clone();
        const body = await clone.text();
        cache.set(key, {
          at: Date.now(),
          status: res.status,
          statusText: res.statusText,
          headers: [...res.headers.entries()],
          body,
        });
      }
      return res;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, p);
  return p.then((r) => r.clone());
}
