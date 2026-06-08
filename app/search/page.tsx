'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import type { MaterialRequest, Issue, Witness } from '@/lib/types';

type Results = {
  requests: MaterialRequest[];
  issues: Issue[];
  witnesses: Witness[];
};

const EMPTY: Results = { requests: [], issues: [], witnesses: [] };

function escapeLike(s: string): string {
  // PostgREST or() 구문에서 특수문자 처리
  return s.replace(/[%,()]/g, ' ').trim();
}

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function SearchPage() {
  const { committee, setCommittee } = useCommittee();
  const router = useRouter();

  const [q, setQ] = useState('');
  const [scopeAll, setScopeAll] = useState(true);
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (term: string) => {
      const needle = escapeLike(term);
      if (needle.length < 1) {
        setResults(EMPTY);
        setSearched(false);
        return;
      }
      setLoading(true);
      const like = `%${needle}%`;

      let reqQ = supabase
        .from('material_requests')
        .select('*')
        .or(`title.ilike.${like},note.ilike.${like},dept.ilike.${like},dept_main.ilike.${like},member.ilike.${like}`)
        .limit(50);
      let issQ = supabase
        .from('issues')
        .select('*')
        .or(`content.ilike.${like},action.ilike.${like},dept.ilike.${like},type.ilike.${like}`)
        .limit(50);
      let witQ = supabase
        .from('witnesses')
        .select('*')
        .or(`name.ilike.${like},org.ilike.${like},pos.ilike.${like},note.ilike.${like}`)
        .limit(50);

      if (!scopeAll) {
        reqQ = reqQ.eq('committee', committee);
        issQ = issQ.eq('committee', committee);
        witQ = witQ.eq('committee', committee);
      }

      const [reqRes, issRes, witRes] = await Promise.all([reqQ, issQ, witQ]);

      setResults({
        requests: (reqRes.data as MaterialRequest[]) ?? [],
        issues: (issRes.data as Issue[]) ?? [],
        witnesses: (witRes.data as Witness[]) ?? [],
      });
      setSearched(true);
      setLoading(false);
    },
    [committee, scopeAll],
  );

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(q), 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, runSearch]);

  const total =
    results.requests.length + results.issues.length + results.witnesses.length;

  // 다른 위원회 결과 클릭 시: 해당 위원회로 전환 후 이동
  const goTo = (targetCommittee: string | null, path: string) => {
    if (targetCommittee && targetCommittee !== committee) {
      setCommittee(targetCommittee);
    }
    router.push(path);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-[#1F4E79]">통합 검색</h1>

      {/* 검색창 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
        <input
          type="text"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="자료요구·지적사항·증인을 한 번에 검색하세요 (예: 예산, 보조금, 홍길동)"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40"
        />
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={scopeAll}
              onChange={() => setScopeAll(true)}
            />
            전체 위원회
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={!scopeAll}
              onChange={() => setScopeAll(false)}
            />
            현재 위원회만 ({committee})
          </label>
          {searched && !loading && (
            <span className="ml-auto text-gray-500">총 {total}건</span>
          )}
        </div>
      </div>

      {loading && <p className="text-gray-500 text-sm">검색 중...</p>}

      {searched && !loading && total === 0 && (
        <p className="text-gray-500 text-sm py-8 text-center">검색 결과가 없습니다.</p>
      )}

      {!loading && results.requests.length > 0 && (
        <ResultGroup title="자료요구" count={results.requests.length} color="#1F4E79">
          {results.requests.map((r) => (
            <button
              key={r.id}
              onClick={() => goTo(r.committee, '/docs')}
              className="w-full text-left border-b border-gray-100 py-2.5 hover:bg-gray-50 px-2 rounded"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 flex-1 truncate">
                  {highlight(r.title, q)}
                </span>
                <span className="text-xs text-white rounded px-2 py-0.5" style={{ backgroundColor: '#1F4E79' }}>
                  {r.committee}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {[r.member, r.dept, r.status, r.due_date && `마감 ${r.due_date}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </button>
          ))}
        </ResultGroup>
      )}

      {!loading && results.issues.length > 0 && (
        <ResultGroup title="지적사항" count={results.issues.length} color="#C62828">
          {results.issues.map((r) => (
            <button
              key={r.id}
              onClick={() => goTo(r.committee, '/issues')}
              className="w-full text-left border-b border-gray-100 py-2.5 hover:bg-gray-50 px-2 rounded"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-900 flex-1 truncate">
                  {highlight(r.content, q)}
                </span>
                <span className="text-xs text-white rounded px-2 py-0.5" style={{ backgroundColor: '#C62828' }}>
                  {r.type}
                </span>
                <span className="text-xs text-white rounded px-2 py-0.5" style={{ backgroundColor: '#1F4E79' }}>
                  {r.committee}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {[r.dept, r.proc, r.date].filter(Boolean).join(' · ')}
              </p>
            </button>
          ))}
        </ResultGroup>
      )}

      {!loading && results.witnesses.length > 0 && (
        <ResultGroup title="증인·참고인" count={results.witnesses.length} color="#B45309">
          {results.witnesses.map((r) => (
            <button
              key={r.id}
              onClick={() => goTo(r.committee, '/witnesses')}
              className="w-full text-left border-b border-gray-100 py-2.5 hover:bg-gray-50 px-2 rounded"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 flex-1 truncate">
                  {highlight(r.name, q)}
                </span>
                <span className="text-xs text-white rounded px-2 py-0.5" style={{ backgroundColor: '#B45309' }}>
                  {r.kind}
                </span>
                <span className="text-xs text-white rounded px-2 py-0.5" style={{ backgroundColor: '#1F4E79' }}>
                  {r.committee}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {[r.org, r.pos, r.attend, r.dt].filter(Boolean).join(' · ')}
              </p>
            </button>
          ))}
        </ResultGroup>
      )}
    </div>
  );
}

function ResultGroup({
  title,
  count,
  color,
  children,
}: {
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-2 h-5 rounded" style={{ backgroundColor: color }} />
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <span className="text-sm text-gray-400">{count}건</span>
      </div>
      {children}
    </div>
  );
}
