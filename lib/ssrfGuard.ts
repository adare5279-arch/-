import { lookup } from 'node:dns/promises';
import net from 'node:net';

// SSRF 방어: 서버가 사용자 제공 URL을 fetch하기 전에 호출한다.
// https만 허용하고, 호스트가 사설/루프백/링크로컬/메타데이터 IP로 해석되면 거부한다.

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 루프백
    if (a === 169 && b === 254) return true; // 링크로컬 + 클라우드 메타데이터(169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true; // 루프백/미지정
    if (v.startsWith('fe80')) return true; // 링크로컬
    if (v.startsWith('fc') || v.startsWith('fd')) return true; // ULA(사설)
    // IPv4-mapped (::ffff:a.b.c.d)
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // 해석 불가 → 안전하게 거부
}

// 통과하면 검증된 URL 문자열을 돌려주고, 위험하면 예외를 던진다.
export async function assertPublicHttpsUrl(raw: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('유효한 URL이 아닙니다.');
  }
  if (u.protocol !== 'https:') {
    throw new Error('https URL만 허용됩니다.');
  }
  // 호스트가 IP 리터럴이면 즉시 검사
  if (net.isIP(u.hostname)) {
    if (isPrivateIp(u.hostname)) throw new Error('사설/내부 주소는 허용되지 않습니다.');
    return u.toString();
  }
  // 도메인이면 DNS 해석 결과(모든 레코드)를 검사 — DNS rebinding/우회 차단
  let records: { address: string }[];
  try {
    records = await lookup(u.hostname, { all: true });
  } catch {
    throw new Error('호스트를 해석할 수 없습니다.');
  }
  if (records.length === 0 || records.some((r) => isPrivateIp(r.address))) {
    throw new Error('사설/내부 주소로 해석되는 호스트는 허용되지 않습니다.');
  }
  return u.toString();
}
