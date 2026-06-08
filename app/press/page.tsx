'use client';

import { useCallback, useEffect, useState } from 'react';

const SOURCE = 'https://www.ggc.go.kr/site/main/xb/lwmkr/lawmakerpressrelease';

type PressItem = {
  id: string;
  title: string;
  author: string;
  date: string;
  views: string;
  url: string;
};

type ApiResp = {
  items?: PressItem[];
  page?: number;
  hasNext?: boolean;
  error?: string;
};

const FIELDS = [
  { value: '', label: '전체' },
  { value: 'baTitle', label: '제목' },
  { value: 'baContentPlain', label: '내용' },
] as const;

export default function PressPage() {
  const [q, setQ] = useState('');
  const [field, setField] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PressItem[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 실제 조회에 사용된 검색어(목록 헤더 표기용)
  const [activeQ, setActiveQ] = useState('');

  const fetchPage = useCallback(
    async (keyword: string, fld: string, p: number) => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          q: keyword,
          field: fld,
          page: String(p),
          size: '20',
        });
        const res = await fetch(`/api/press-releases?${params.toString()}`);
        const data = (await res.json()) as ApiResp;
        if (!res.ok || data.error) {
          setError(data.error ?? `조회 실패 (${res.status})`);
          setItems([]);
          setHasNext(false);
        } else {
          setItems(data.items ?? []);
          setHasNext(Boolean(data.hasNext));
          setActiveQ(keyword);
        }
      } catch (e) {
        setError(String(e));
        setItems([]);
        setHasNext(false);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // 최초 진입 시 최신 보도자료 표시
  useEffect(() => {
    fetchPage('', '', 1);
  }, [fetchPage]);

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setPage(1);
    fetchPage(q.trim(), field, 1);
  }

  function goPage(p: number) {
    if (p < 1) return;
    setPage(p);
    fetchPage(activeQ, field, p);
  }

  const linkBuilder = (term: string) => {
    return () => {
      setQ(term);
      setPage(1);
      fetchPage(term, field, 1);
    };
  };

  const inputCls =
    'rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  return (
    <div className="p-6 space-y-6">
      {/* Heading */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#1F4E79]">행정사무감사 보도자료</h1>
          <p className="text-xs text-gray-500 mt-1">
            경기도의회 의원 보도자료를 주제·의원 이름으로 검색합니다. (원문: 경기도의회 공식
            홈페이지)
          </p>
        </div>
        <a
          href={SOURCE}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-[#1F4E79] bg-white px-4 py-2 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors"
        >
          경기도의회 보도자료 전체 보기 ↗
        </a>
      </div>

      {/* Search */}
      <form
        onSubmit={handleSearch}
        className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          검색 구분
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className={inputCls}
          >
            {FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700 flex-1 min-w-[200px]">
          검색어 (주제·의원 이름)
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="예: 행정사무감사, 김종배, 보건복지"
            className={inputCls}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[#1F4E79] px-5 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors disabled:opacity-50"
        >
          {loading ? '검색 중...' : '검색'}
        </button>
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              setField('');
              setPage(1);
              fetchPage('', '', 1);
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            초기화
          </button>
        )}
      </form>

      {/* 빠른 검색 칩 */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-gray-400">빠른 검색:</span>
        {['행정사무감사', '시정요구', '예산', '조례', '감사'].map((t) => (
          <button
            key={t}
            onClick={linkBuilder(t)}
            className="rounded-full border border-gray-300 px-3 py-1 text-gray-600 hover:border-[#1F4E79] hover:text-[#1F4E79] transition-colors"
          >
            {t}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        {loading ? (
          <p className="text-sm text-gray-500 py-6 text-center">불러오는 중...</p>
        ) : error ? (
          <p className="text-sm text-[#C62828] py-6 text-center">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            {activeQ ? `'${activeQ}'에 대한 보도자료가 없습니다.` : '보도자료가 없습니다.'}
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-3">
              {activeQ ? (
                <>
                  <span className="font-semibold text-[#1F4E79]">{activeQ}</span> 검색 결과 (
                  {page}페이지)
                </>
              ) : (
                <>최신 보도자료 ({page}페이지)</>
              )}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-2 px-3 font-semibold text-gray-700">제목</th>
                    <th className="py-2 px-3 font-semibold text-gray-700 whitespace-nowrap">
                      작성자
                    </th>
                    <th className="py-2 px-3 font-semibold text-gray-700 whitespace-nowrap">
                      일자
                    </th>
                    <th className="py-2 px-3 font-semibold text-gray-700 whitespace-nowrap">
                      조회
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-2 px-3">
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1F4E79] hover:underline"
                        >
                          {m.title}
                        </a>
                      </td>
                      <td className="py-2 px-3 text-gray-700 whitespace-nowrap">
                        {m.author || '—'}
                      </td>
                      <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{m.date || '—'}</td>
                      <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{m.views || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                onClick={() => goPage(page - 1)}
                disabled={page <= 1 || loading}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-[#1F4E79] hover:text-[#1F4E79] disabled:opacity-40 transition-colors"
              >
                이전
              </button>
              <span className="text-sm text-gray-600">{page} 페이지</span>
              <button
                onClick={() => goPage(page + 1)}
                disabled={!hasNext || loading}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-[#1F4E79] hover:text-[#1F4E79] disabled:opacity-40 transition-colors"
              >
                다음
              </button>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-gray-400">
        ※ 본 목록은 경기도의회 공식 홈페이지의 보도자료를 실시간으로 불러와 표시합니다. 제목을
        클릭하면 원문 페이지가 새 창으로 열립니다.
      </p>
    </div>
  );
}
