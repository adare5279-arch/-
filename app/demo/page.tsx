'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useCommittee } from '@/lib/CommitteeContext';
import { supabase } from '@/lib/supabaseClient';
import { insertRows } from '@/lib/dataApi';

// 최소 풀스택 데모: 질문 입력 → 백엔드(/api/ask) → (DB 조회) → AI 처리 → 결과 출력 → 기록 저장
type QaRow = {
  id: number;
  committee: string | null;
  question: string;
  answer: string;
  used_data: boolean;
  created_at: string;
};

type Source = {
  source: string;
  label: string;
  snippet: string;
  table?: 'issues' | 'material_requests' | 'witnesses' | 'meeting_minutes';
  id?: number;
};

const KEY_STORE = 'haengam_anthropic_key';

const SRC_COLOR: Record<string, string> = {
  지적사항: 'bg-[#C62828]/10 text-[#C62828]',
  자료요구: 'bg-[#1F4E79]/10 text-[#1F4E79]',
  '증인·참고인': 'bg-[#2E7D32]/10 text-[#2E7D32]',
  회의록: 'bg-[#6A1B9A]/10 text-[#6A1B9A]',
};

// 인용을 클릭하면 원본 레코드가 있는 화면으로 이동(해당 행으로 스크롤·강조)
const SRC_PATH: Record<string, string> = {
  issues: '/issues',
  material_requests: '/docs',
  witnesses: '/witnesses',
  meeting_minutes: '/meetings',
};

export default function DemoPage() {
  const { committee } = useCommittee();
  const [question, setQuestion] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [useData, setUseData] = useState(true);
  const [answer, setAnswer] = useState('');
  const [usedData, setUsedData] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<QaRow[]>([]);

  // 개인 키 복원 (재입력 불필요)
  useEffect(() => {
    const saved = localStorage.getItem(KEY_STORE);
    if (saved) setApiKey(saved);
  }, []);

  const fetchHistory = useCallback(async () => {
    const { data } = await supabase
      .from('demo_qa')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    setHistory((data as QaRow[]) ?? []);
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function onKeyChange(v: string) {
    setApiKey(v);
    if (v.trim()) localStorage.setItem(KEY_STORE, v.trim());
    else localStorage.removeItem(KEY_STORE);
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) {
      setError('질문을 입력하세요.');
      return;
    }
    setLoading(true);
    setError('');
    setAnswer('');
    setSources([]);
    setUsedData(false);
    setCopied(false);
    try {
      // 프론트엔드 → 백엔드 호출 (NDJSON 스트림)
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: q,
          apiKey: apiKey.trim() || undefined,
          committee,
          useData,
        }),
      });

      // 사전검증 실패(키 없음·rate limit 등)는 JSON으로 옴
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `요청 실패 (HTTP ${res.status})`);
        return;
      }

      // 스트림을 줄 단위로 읽어 실시간 누적
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      let used = false;
      let streamError = '';

      const handleLine = (line: string) => {
        const s = line.trim();
        if (!s) return;
        let msg: { type?: string; text?: string; sources?: Source[]; usedData?: boolean; error?: string };
        try {
          msg = JSON.parse(s);
        } catch {
          return;
        }
        if (msg.type === 'sources') setSources(msg.sources ?? []);
        else if (msg.type === 'delta') {
          acc += msg.text ?? '';
          setAnswer(acc);
        } else if (msg.type === 'done') {
          used = Boolean(msg.usedData);
          setUsedData(used);
        } else if (msg.type === 'error') {
          streamError = msg.error ?? '처리 오류';
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          handleLine(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
        }
      }
      if (buf) handleLine(buf);

      if (streamError) {
        setError(streamError);
        return;
      }

      // 완료된 전체 답변을 게이트웨이로 저장 후 목록 갱신
      const ans = acc.trim();
      if (ans) {
        await insertRows('demo_qa', {
          committee,
          question: q,
          answer: ans,
          used_data: used,
        });
        fetchHistory();
      }
    } catch (err) {
      setError(`네트워크 오류: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('복사에 실패했습니다.');
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-[#1F4E79]">한 줄 질문 (AI 데모)</h1>
        <p className="text-sm text-gray-500 mt-1">
          질문 입력 → 백엔드(<code className="text-[#1F4E79]">/api/ask</code>) → DB 조회 → AI 처리 →
          결과 출력 → 기록 저장의 풀스택 흐름입니다.
        </p>
      </div>

      {/* 흐름 표시 */}
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 flex-wrap">
        {['① 질문 입력', '② 백엔드 /api/ask', '③ DB + AI 처리', '④ 결과 출력', '⑤ 기록 저장'].map(
          (s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="rounded-full bg-[#1F4E79]/10 text-[#1F4E79] px-3 py-1">{s}</span>
              {i < arr.length - 1 && <span aria-hidden>→</span>}
            </span>
          ),
        )}
      </div>

      <form onSubmit={handleAsk} className="space-y-3 bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <label className="text-sm font-semibold text-gray-700 flex flex-col gap-1">
          질문
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            placeholder="예: 우리 위원회에서 미조치 상태인 지적사항을 정리해줘"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={useData}
            onChange={(e) => setUseData(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span>
            <strong className="text-[#1F4E79]">{committee}</strong> 의 실제 감사 데이터(지적사항·자료요구)를
            AI에 참고로 제공
          </span>
        </label>

        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer select-none">개인 API 키(선택) — 서버에 키가 없을 때만 입력</summary>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder="sk-ant-... (브라우저에만 저장, 서버 전송은 요청 시에만)"
            className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40"
          />
          {apiKey && <p className="mt-1 text-[11px] text-gray-400">이 브라우저에 저장됨 — 다음 방문 시 자동 입력</p>}
        </details>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-lg bg-[#1F4E79] px-5 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors disabled:opacity-50"
          >
            {loading ? 'AI 처리 중...' : '질문 보내기'}
          </button>
          {loading && <span className="text-xs text-[#B45309]">백엔드 → DB → AI 응답을 기다리는 중...</span>}
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {answer && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500">
              ④ AI 결과 {usedData && <span className="text-[#2E7D32]">· 위원회 데이터 참고함</span>}
            </p>
            <button
              onClick={copyAnswer}
              className="text-xs text-[#1F4E79] hover:underline"
            >
              {copied ? '복사됨!' : '복사'}
            </button>
          </div>
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{answer}</p>
        </div>
      )}

      {/* 근거 자료 (DB에서 질문과 관련해 검색한 항목) */}
      {sources.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">
            근거 자료 ({sources.length}건) — DB에서 질문과 관련해 검색됨 · 클릭하면 원본으로 이동
          </p>
          <ul className="space-y-1">
            {sources.map((s, i) => {
              const href =
                s.table && s.id != null ? `${SRC_PATH[s.table]}?focus=${s.id}` : null;
              const inner = (
                <>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                      SRC_COLOR[s.source] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {s.source}
                  </span>
                  <span className="min-w-0">
                    <span className="text-xs text-gray-400">{s.label}</span>
                    <span className="block text-sm text-gray-700">{s.snippet}</span>
                  </span>
                  {href && (
                    <span className="ml-auto shrink-0 self-center text-xs text-[#1F4E79]" aria-hidden>
                      원본 보기 →
                    </span>
                  )}
                </>
              );
              return (
                <li key={i}>
                  {href ? (
                    <Link
                      href={href}
                      className="flex gap-2 items-start rounded px-1.5 py-1 -mx-1.5 hover:bg-[#1F4E79]/5 transition-colors"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex gap-2 items-start px-1.5 py-1">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 최근 기록 (DB에서 읽어옴) */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">최근 질문 기록 (DB 저장)</p>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">아직 기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {history.map((h) => (
              <li key={h.id} className="py-2">
                <p className="text-sm text-gray-800 truncate">Q. {h.question}</p>
                <p className="text-xs text-gray-400">
                  {h.created_at.slice(0, 16).replace('T', ' ')}
                  {h.committee ? ` · ${h.committee}` : ''}
                  {h.used_data ? ' · 데이터참고' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
