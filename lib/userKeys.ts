// 사용자별 개인 API 키 보관 (브라우저 localStorage 전용).
// 키는 이 브라우저에만 저장되며 서버나 DB에 저장되지 않습니다.
// 요청 시에만 서버 라우트로 전달되어 즉시 사용되고 폐기됩니다.

const OPENAI = 'byo_openai_key';
const ANTHROPIC = 'byo_anthropic_key';

function safeGet(k: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(k) || '';
  } catch {
    return '';
  }
}

function safeSet(k: string, v: string): void {
  if (typeof window === 'undefined') return;
  try {
    const val = v.trim();
    if (val) localStorage.setItem(k, val);
    else localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export const getOpenAiKey = () => safeGet(OPENAI);
export const setOpenAiKey = (v: string) => safeSet(OPENAI, v);
export const getAnthropicKey = () => safeGet(ANTHROPIC);
export const setAnthropicKey = (v: string) => safeSet(ANTHROPIC, v);

/** 키 일부만 노출하는 마스킹 표기 (예: sk-…AB12) */
export function maskKey(k: string): string {
  if (!k) return '';
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 3)}…${k.slice(-4)}`;
}
