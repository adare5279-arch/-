'use client';

import { useEffect, useState } from 'react';
import {
  type AiSettings,
  type Provider,
  PROVIDER_LABELS,
  DEFAULT_MODELS,
  KEY_HINTS,
  defaultSettings,
  loadSettings,
  saveSettings,
} from '@/lib/aiSettings';

const PROVIDERS: Provider[] = ['gemini', 'claude', 'openai'];

export default function SettingsPage() {
  const [settings, setSettings] = useState<AiSettings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [reveal, setReveal] = useState<Record<Provider, boolean>>({
    gemini: false,
    claude: false,
    openai: false,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function update(next: AiSettings) {
    setSettings(next);
    setSaved(false);
    setTestResult(null);
  }

  function handleSave() {
    saveSettings(settings);
    setSaved(true);
  }

  async function handleTest() {
    saveSettings(settings);
    setSaved(true);
    setTesting(true);
    setTestResult(null);
    try {
      const { callAi } = await import('@/lib/aiSettings');
      const res = await callAi({
        prompt: '연결 확인용 테스트입니다. "OK"라고만 답하세요.',
      });
      if (res.error) setTestResult({ ok: false, msg: res.error });
      else setTestResult({ ok: true, msg: `응답: ${(res.text ?? '').trim().slice(0, 120) || '(빈 응답)'}` });
    } finally {
      setTesting(false);
    }
  }

  const current = settings.provider;

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-extrabold text-[#1F4E79]">AI 설정</h1>
      <p className="mt-2 text-sm text-gray-600">
        의원별 발언 정리 등에서 사용할 AI 공급자와 API 키를 설정합니다. 키는{' '}
        <strong>이 브라우저에만 저장</strong>되며 서버에 영구 저장되지 않습니다.
      </p>

      {/* 공급자 선택 */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-gray-800">사용할 AI 모델</h2>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PROVIDERS.map((p) => {
            const active = current === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => update({ ...settings, provider: p })}
                className={[
                  'rounded-lg border px-4 py-3 text-left transition-colors',
                  active
                    ? 'border-[#1F4E79] bg-[#1F4E79]/5 ring-2 ring-[#1F4E79]/30'
                    : 'border-gray-200 hover:bg-gray-50',
                ].join(' ')}
              >
                <span className="block text-sm font-semibold text-gray-900">
                  {PROVIDER_LABELS[p]}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {p === 'gemini' ? '무료 등급 제공' : p === 'claude' ? '유료' : '유료'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 키 입력 */}
      <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-gray-800">API 키</h2>
        <p className="mt-1 text-xs text-gray-500">
          선택한 공급자({PROVIDER_LABELS[current]})의 키만 있으면 됩니다. 비워두면 서버 공용 키가 있을 때 그것을 사용합니다.
        </p>
        <div className="mt-4 space-y-4">
          {PROVIDERS.map((p) => (
            <div
              key={p}
              className={[
                'rounded-lg border p-3',
                current === p ? 'border-[#1F4E79]/40 bg-[#1F4E79]/[0.03]' : 'border-gray-200',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-gray-800">
                  {PROVIDER_LABELS[p]} 키
                  {current === p && (
                    <span className="ml-2 rounded bg-[#1F4E79]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#1F4E79]">
                      사용 중
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setReveal((r) => ({ ...r, [p]: !r[p] }))}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  {reveal[p] ? '숨기기' : '보기'}
                </button>
              </div>
              <input
                type={reveal[p] ? 'text' : 'password'}
                value={settings.keys[p]}
                onChange={(e) => update({ ...settings, keys: { ...settings.keys, [p]: e.target.value } })}
                placeholder={`${PROVIDER_LABELS[p]} API 키 입력`}
                autoComplete="off"
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/30"
              />
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={settings.models[p] ?? ''}
                  onChange={(e) => update({ ...settings, models: { ...settings.models, [p]: e.target.value } })}
                  placeholder={`모델명 (기본: ${DEFAULT_MODELS[p]})`}
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/20"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400">{KEY_HINTS[p]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 저장 / 테스트 */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-[#1F4E79] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1a4267]"
        >
          저장
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="rounded-lg border border-[#1F4E79] px-5 py-2.5 text-sm font-semibold text-[#1F4E79] hover:bg-[#1F4E79]/5 disabled:opacity-50"
        >
          {testing ? '연결 확인 중…' : '연결 테스트'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">저장됨 ✓</span>}
        {testResult && (
          <span className={`text-sm font-medium ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
            {testResult.ok ? '연결 성공 — ' : '실패 — '}
            {testResult.msg}
          </span>
        )}
      </div>

      {/* 뤼튼 안내 */}
      <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-sm font-bold text-amber-900">뤼튼(Wrtn)으로 API 없이 쓸 수 있나요?</h2>
        <p className="mt-2 text-sm text-amber-900/90 leading-relaxed">
          결론부터 말하면 <strong>권장하지 않습니다</strong>. 뤼튼은 일반 사용자용(B2C) 서비스로,
          외부 앱이 프로그램적으로 LLM을 호출할 수 있는 <strong>공식 개발자 API가 공개되어 있지 않습니다</strong>.
          웹 화면을 자동으로 흉내 내 우회하는 방식은 약관 위반·차단·불안정 문제가 있어 실무에 적합하지 않습니다.
        </p>
        <p className="mt-2 text-sm text-amber-900/90 leading-relaxed">
          <strong>비용 없이 시작하려면 Google Gemini를 추천합니다.</strong>{' '}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold"
          >
            Google AI Studio
          </a>
          에서 무료 등급 키를 즉시 발급받아 위 &quot;Google Gemini 키&quot;에 붙여넣으면 바로 사용할 수 있습니다.
        </p>
      </section>
    </main>
  );
}
