'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LAWS, type LawDoc, type LawArticle } from '@/lib/laws';

const UPDATED = '2026-06-08';

// 조 번호(예: "제50조")만 추출 — 딥링크 앵커용
function joKey(heading: string) {
  return heading.split('(')[0];
}

// 개정·신설 등 연혁 표기를 본문과 시각적으로 구분
function renderLine(text: string, key: number) {
  const parts = text.split(/(<[^>]*>|\[[^\]]*\])/g).filter((p) => p !== '');
  return (
    <p key={key} className="text-[15px] leading-7 text-gray-800">
      {parts.map((p, i) => {
        const isMeta = /^<.*>$/.test(p) || /^\[.*\]$/.test(p);
        return isMeta ? (
          <span key={i} className="text-xs text-gray-400 align-middle">
            {' '}
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </p>
  );
}

function ArticleBlock({ a, highlight }: { a: LawArticle; highlight: boolean }) {
  return (
    <div
      id={`jo-${joKey(a.heading)}`}
      className={`scroll-mt-24 border-b border-gray-100 py-4 last:border-b-0 transition-colors ${
        highlight ? 'bg-amber-100 rounded-lg -mx-3 px-3' : ''
      }`}
    >
      <h3 className="text-[15px] font-bold text-[#1F4E79] mb-2">{a.heading}</h3>
      <div className="space-y-1.5 pl-1">
        {a.lines.map((ln, i) => renderLine(ln, i))}
      </div>
    </div>
  );
}

export default function LawsPage() {
  const [activeId, setActiveId] = useState<string>(LAWS[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [showAddenda, setShowAddenda] = useState(false);
  const [showForms, setShowForms] = useState(false);
  const [highlightJo, setHighlightJo] = useState<string>('');
  const pendingJo = useRef<string>('');

  // 지적사항 등에서 ?law=&jo= 로 진입 시 해당 법령·조문으로 이동·강조
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const law = params.get('law');
    const jo = params.get('jo');
    if (law && LAWS.some((l) => l.id === law)) {
      setActiveId(law);
      setQ('');
    }
    if (jo) pendingJo.current = jo;
  }, []);

  // 대상 법령이 렌더된 뒤 조문으로 스크롤·강조
  useEffect(() => {
    const jo = pendingJo.current;
    if (!jo) return;
    const el = document.getElementById(`jo-${jo}`);
    if (!el) return;
    pendingJo.current = '';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightJo(jo);
    const t = setTimeout(() => setHighlightJo(''), 2600);
    return () => clearTimeout(t);
  }, [activeId]);

  const law: LawDoc | undefined = useMemo(
    () => LAWS.find((l) => l.id === activeId) ?? LAWS[0],
    [activeId],
  );

  const articles = useMemo(() => {
    if (!law) return [];
    const kw = q.trim();
    if (!kw) return law.articles;
    return law.articles.filter(
      (a) => a.heading.includes(kw) || a.lines.some((ln) => ln.includes(kw)),
    );
  }, [law, q]);

  if (!law) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#1F4E79]">행정사무감사 근거법령</h1>
          <p className="text-xs text-gray-500 mt-1">
            국가법령정보센터(law.go.kr) 원문 기준 · 현행화 {UPDATED}
          </p>
        </div>
      </div>

      {/* 법령 선택 탭 */}
      <div className="flex gap-2 flex-wrap">
        {LAWS.map((l) => {
          const active = l.id === activeId;
          return (
            <button
              key={l.id}
              onClick={() => {
                setActiveId(l.id);
                setQ('');
                setShowAddenda(false);
                setShowForms(false);
              }}
              className={[
                'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-[#1F4E79] bg-[#1F4E79] text-white'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {l.name}
            </button>
          );
        })}
      </div>

      {/* 법령 메타 정보 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-gray-900">{law.name}</h2>
            <p className="text-sm text-gray-500">{law.scope}</p>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-gray-500 shrink-0">시행일</dt>
                <dd className="text-gray-800 font-medium">{law.enforce}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-500 shrink-0">공포</dt>
                <dd className="text-gray-800">{law.promulgation}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-500 shrink-0">소관</dt>
                <dd className="text-gray-800">{law.authority}</dd>
              </div>
            </dl>
          </div>
          <a
            href={law.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[#1F4E79] bg-white px-4 py-2 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors whitespace-nowrap"
          >
            국가법령정보센터 원문 ↗
          </a>
        </div>
      </div>

      {/* 조문 검색 */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="조문 내용 검색 (예: 증인, 과태료, 서류제출)"
          className="flex-1 min-w-[14rem] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/30"
        />
        <span className="text-sm text-gray-500">
          {articles.length}개 조문{q.trim() ? ` (전체 ${law.articles.length})` : ''}
        </span>
      </div>

      {/* 조문 본문 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-2">
        {articles.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">검색 결과가 없습니다.</p>
        ) : (
          articles.map((a) => (
            <ArticleBlock key={a.heading} a={a} highlight={highlightJo === joKey(a.heading)} />
          ))
        )}
      </div>

      {/* 부칙 */}
      {law.addenda.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <button
            onClick={() => setShowAddenda((s) => !s)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700"
          >
            <span>{showAddenda ? '▾' : '▸'}</span> 부칙
          </button>
          {showAddenda && (
            <div className="mt-3 space-y-1 text-sm text-gray-700">
              {law.addenda.map((ln, i) => (
                <p
                  key={i}
                  className={
                    /^부\s*칙/.test(ln) ? 'font-semibold text-gray-800 mt-2' : 'pl-3 text-gray-600'
                  }
                >
                  {ln}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 별지서식 */}
      {law.forms.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <button
            onClick={() => setShowForms((s) => !s)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700"
          >
            <span>{showForms ? '▾' : '▸'}</span> 별지서식 ({law.forms.length})
          </button>
          {showForms && (
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm text-gray-700">
              {law.forms.map((f, i) => (
                <li key={i} className="pl-1">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 leading-5">
        ※ 본 자료는 실무 참고용으로 국가법령정보센터 원문을 수록한 것이며, 법적 효력은 공식 원문에
        따릅니다. 최신 개정 여부는 상단의 “국가법령정보센터 원문” 링크에서 확인하세요.
      </p>
    </div>
  );
}
