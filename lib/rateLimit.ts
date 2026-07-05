// 인스턴스 단위 메모리 기반 rate limit.
// ⚠️ 서버리스(Vercel)에서는 인스턴스가 여러 개·휘발성이라 완벽한 방어가 아니다.
// 외부인이 서버 공용 API 키를 남용하는 것을 줄이는 1차 방어선으로만 쓴다.
// 강한 제한이 필요하면 Upstash 등 외부 저장소 기반으로 교체할 것.

type Bucket = number[];
const buckets = new Map<string, Bucket>();

export function rateLimited(
  key: string,
  { windowMs = 60_000, max = 10 }: { windowMs?: number; max?: number } = {},
): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  buckets.set(key, arr);
  // 메모리 누수 방지: 버킷이 많아지면 만료된 항목 정리
  if (buckets.size > 500) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return arr.length > max;
}

// x-forwarded-for는 위조 가능하므로 rate limit 식별자 용도로만 사용한다.
export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
