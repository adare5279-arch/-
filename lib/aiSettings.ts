// AI 공급자 설정 — 브라우저(localStorage)에만 저장됩니다. 서버로 키를 영구 저장하지 않습니다.

export type Provider = 'gemini' | 'claude' | 'openai';

export type AiSettings = {
  provider: Provider;
  keys: Record<Provider, string>;
  models: Partial<Record<Provider, string>>;
};

const STORAGE_KEY = 'haengam_ai';

export const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
  openai: 'OpenAI GPT',
};

export const DEFAULT_MODELS: Record<Provider, string> = {
  gemini: 'gemini-2.0-flash',
  claude: 'claude-sonnet-4-5',
  openai: 'gpt-4o',
};

export const KEY_HINTS: Record<Provider, string> = {
  gemini: 'aistudio.google.com/app/apikey 에서 무료로 발급 (AIza... 형식)',
  claude: 'console.anthropic.com 에서 발급 (sk-ant-... 형식)',
  openai: 'platform.openai.com/api-keys 에서 발급 (sk-... 형식)',
};

export function defaultSettings(): AiSettings {
  return {
    provider: 'gemini',
    keys: { gemini: '', claude: '', openai: '' },
    models: {},
  };
}

export function loadSettings(): AiSettings {
  if (typeof window === 'undefined') return defaultSettings();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    const base = defaultSettings();
    return {
      provider: parsed.provider ?? base.provider,
      keys: { ...base.keys, ...(parsed.keys ?? {}) },
      models: { ...(parsed.models ?? {}) },
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: AiSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export type CallAiResult = { text?: string; error?: string };

// 선택된 공급자/키/모델로 /api/generate-query 호출
export async function callAi(args: { system?: string; prompt: string }): Promise<CallAiResult> {
  const s = loadSettings();
  const provider = s.provider;
  const apiKey = s.keys[provider]?.trim() || undefined;
  const model = s.models[provider]?.trim() || DEFAULT_MODELS[provider];

  try {
    const res = await fetch('/api/generate-query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engine: provider,
        prompt: args.prompt,
        ...(args.system ? { system: args.system } : {}),
        model,
        ...(apiKey ? { apiKey } : {}),
      }),
    });
    const data = (await res.json()) as CallAiResult;
    if (!res.ok) return { error: data.error ?? `요청 실패 (${res.status})` };
    return { text: data.text ?? '' };
  } catch (e) {
    return { error: String(e) };
  }
}
