'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { insertRows } from '@/lib/dataApi';
import { exportWorkbook, makeSheet } from '@/lib/exportXlsx';
import type { BudgetItem } from '@/lib/types';
import Lofin365Links from '@/components/Lofin365Links';

const won = (n: number) => n.toLocaleString('ko-KR');
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// 이상 항목 → 지적사항 본문 자동 생성
function issueContent(r: BudgetItem, kind: '저조집행' | '초과집행' | '불용과다'): string {
  const head = `[${r.dept ?? '부서미상'}] '${r.program}' 사업(${r.year}년, 예산현액 ${won(
    r.budget
  )}천원)`;
  const exRate = r.budget > 0 ? r.executed / r.budget : 0;
  const unused = Math.max(0, r.budget - r.executed - r.carryover);
  if (kind === '초과집행') {
    return `${head}은 집행액이 ${won(r.executed)}천원으로 예산현액을 ${won(
      r.executed - r.budget
    )}천원 초과 집행함. 초과 집행의 근거 및 예산 전용·추경 등 적법한 절차 이행 여부 점검 필요.`;
  }
  if (kind === '불용과다') {
    return `${head}의 불용액이 ${won(unused)}천원(예산의 ${pct(
      unused / r.budget
    )})으로 과다 발생함. 예산편성의 적정성과 불용 발생 원인, 재발 방지 대책 점검 필요.`;
  }
  return `${head}의 집행률이 ${pct(
    exRate
  )}에 그쳐 예산 집행이 저조함. 집행 부진 사유와 사업 추진상 애로사항, 향후 집행계획 점검 필요.`;
}

// 이상 유형별 지적사항 분류
const ISSUE_TYPE_BY_KIND: Record<'저조집행' | '초과집행' | '불용과다', string> = {
  저조집행: '개선',
  초과집행: '부당',
  불용과다: '개선',
};

type Group = {
  key: string;
  budget: number;
  executed: number;
  carryover: number;
  unused: number;
  count: number;
};

function aggregate(items: BudgetItem[], pick: (r: BudgetItem) => string): Group[] {
  const map = new Map<string, Group>();
  for (const r of items) {
    const key = pick(r) || '미분류';
    const g = map.get(key) ?? { key, budget: 0, executed: 0, carryover: 0, unused: 0, count: 0 };
    g.budget += r.budget;
    g.executed += r.executed;
    g.carryover += r.carryover;
    g.unused += Math.max(0, r.budget - r.executed - r.carryover);
    g.count += 1;
    map.set(key, g);
  }
  return Array.from(map.values()).sort((a, b) => b.budget - a.budget);
}

function rate(g: Group): number {
  return g.budget > 0 ? g.executed / g.budget : 0;
}

export default function AnalysisPage() {
  const { committee } = useCommittee();
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>('전체');
  // 지적사항 등록 상태: 키 = `${itemId}-${kind}`, 값 = 'saving' | 'done'
  const [regState, setRegState] = useState<Record<string, 'saving' | 'done'>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('budget_items')
        .select('*')
        .eq('committee', committee)
        .order('year', { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error('Error fetching budget_items:', error);
        setItems([]);
      } else {
        setItems((data as BudgetItem[]) ?? []);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [committee]);

  const years = useMemo(
    () => Array.from(new Set(items.map((r) => r.year))).sort((a, b) => b - a),
    [items]
  );

  const scoped = useMemo(
    () => (yearFilter === '전체' ? items : items.filter((r) => String(r.year) === yearFilter)),
    [items, yearFilter]
  );

  const byDept = useMemo(() => aggregate(scoped, (r) => r.dept ?? ''), [scoped]);
  const byField = useMemo(() => aggregate(scoped, (r) => r.field ?? ''), [scoped]);

  const totals = useMemo(() => {
    const budget = scoped.reduce((s, r) => s + r.budget, 0);
    const executed = scoped.reduce((s, r) => s + r.executed, 0);
    const carryover = scoped.reduce((s, r) => s + r.carryover, 0);
    const unused = scoped.reduce((s, r) => s + Math.max(0, r.budget - r.executed - r.carryover), 0);
    return { budget, executed, carryover, unused, rate: budget > 0 ? executed / budget : 0 };
  }, [scoped]);

  // 이상 징후: 저집행(집행률<70%), 초과집행, 불용액 과다(예산의 20% 이상)
  const flags = useMemo(() => {
    const low: BudgetItem[] = [];
    const over: BudgetItem[] = [];
    const idle: BudgetItem[] = [];
    for (const r of scoped) {
      if (r.budget <= 0) continue;
      const exRate = r.executed / r.budget;
      const unused = Math.max(0, r.budget - r.executed - r.carryover);
      if (r.executed > r.budget) over.push(r);
      else if (exRate < 0.7) low.push(r);
      if (unused / r.budget >= 0.2) idle.push(r);
    }
    return { low, over, idle };
  }, [scoped]);

  async function registerIssue(r: BudgetItem, kind: '저조집행' | '초과집행' | '불용과다') {
    const regKey = `${r.id}-${kind}`;
    if (regState[regKey]) return; // 중복 등록 방지
    setRegState((s) => ({ ...s, [regKey]: 'saving' }));
    const { error } = await insertRows('issues', {
      committee,
      date: new Date().toISOString().slice(0, 10),
      dept: r.dept,
      type: ISSUE_TYPE_BY_KIND[kind],
      content: issueContent(r, kind),
      proc: '미처리',
    });
    if (error) {
      setRegState((s) => {
        const next = { ...s };
        delete next[regKey];
        return next;
      });
      alert(`지적사항 등록 실패: ${error.message}`);
      return;
    }
    setRegState((s) => ({ ...s, [regKey]: 'done' }));
  }

  // ── 이상 항목 → 자료요구서 AI 자동작성 ────────────────────────────────
  const [reqBusy, setReqBusy] = useState(false);
  const [reqMsg, setReqMsg] = useState('');
  const [reqDraft, setReqDraft] = useState<{ title: string; items: string[] } | null>(null);
  const [reqSaving, setReqSaving] = useState(false);
  const [reqSaved, setReqSaved] = useState(false);

  function anomalyLines(): string[] {
    const fmt = (r: BudgetItem, tag: string) => {
      const exRate = r.budget > 0 ? r.executed / r.budget : 0;
      const unused = Math.max(0, r.budget - r.executed - r.carryover);
      return `- [${tag}] ${r.dept ?? '부서미상'} / ${r.program} (${r.year}년): 예산현액 ${won(
        r.budget,
      )}천원, 집행액 ${won(r.executed)}천원(집행률 ${pct(exRate)}), 불용 ${won(unused)}천원`;
    };
    return [
      ...flags.over.slice(0, 8).map((r) => fmt(r, '초과집행')),
      ...flags.low.slice(0, 8).map((r) => fmt(r, '저조집행')),
      ...flags.idle.slice(0, 8).map((r) => fmt(r, '불용과다')),
    ];
  }

  async function generateMaterialDraft() {
    const lines = anomalyLines();
    if (lines.length === 0) {
      setReqMsg('자료요구서로 만들 이상 항목이 없습니다.');
      return;
    }
    setReqBusy(true);
    setReqMsg('AI가 자료요구서 초안을 작성하는 중...');
    setReqDraft(null);
    setReqSaved(false);
    try {
      const system =
        '당신은 지방의회(경기도의회) 행정사무감사 보좌 전문위원입니다. ' +
        '주어진 예산 집행 이상 항목을 근거로, 소관 부서에 요구할 「자료요구서」 초안을 작성합니다. ' +
        '반드시 아래 JSON 형식만 출력하세요. 자료에 없는 사실은 지어내지 말고, ' +
        '요구자료는 구체적이고 검증 가능하도록(연도·사업명·관련 서류명 포함) 공문 어투로 작성합니다.\n' +
        '{"title":"자료요구서 제목(한 줄)","items":["요구자료 1","요구자료 2"]}';
      const prompt = `다음은 예산 집행 분석에서 발견된 이상 항목입니다. 이를 근거로 자료요구서 초안을 JSON으로 작성하세요.\n\n[이상 항목]\n${lines.join(
        '\n',
      )}`;
      const res = await fetch('/api/generate-query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine: 'claude', system, prompt }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) {
        setReqMsg(data.error || 'AI 호출에 실패했습니다.');
        return;
      }
      const m = (data.text ?? '').match(/\{[\s\S]*\}/);
      if (!m) {
        setReqMsg('AI 응답을 해석하지 못했습니다. 다시 시도해주세요.');
        return;
      }
      const parsed = JSON.parse(m[0]) as { title?: string; items?: string[] };
      const items = Array.isArray(parsed.items) ? parsed.items.map((s) => String(s).trim()).filter(Boolean) : [];
      if (!parsed.title || items.length === 0) {
        setReqMsg('초안 형식이 올바르지 않습니다. 다시 시도해주세요.');
        return;
      }
      setReqDraft({ title: parsed.title.trim(), items });
      setReqMsg('초안이 작성되었습니다. 내용을 검토한 뒤 자료요구로 저장하세요.');
    } catch (e) {
      console.error('material draft error:', e);
      setReqMsg('AI 초안 생성 중 오류가 발생했습니다.');
    } finally {
      setReqBusy(false);
    }
  }

  async function saveMaterialDraft() {
    if (!reqDraft) return;
    setReqSaving(true);
    const note = reqDraft.items.map((it, i) => `${i + 1}. ${it}`).join('\n');
    const { error } = await insertRows('material_requests', {
      committee,
      title: reqDraft.title,
      note,
      status: '미제출',
      req_date: new Date().toISOString().slice(0, 10),
    });
    setReqSaving(false);
    if (error) {
      alert(`자료요구 저장 실패: ${error.message}`);
      return;
    }
    setReqSaved(true);
    setReqMsg('자료요구로 저장되었습니다.');
  }

  function handleExport() {
    const groupCols = [
      { header: '구분', value: (g: Group) => g.key },
      { header: '사업수', value: (g: Group) => g.count },
      { header: '예산현액(천원)', value: (g: Group) => g.budget },
      { header: '집행액(천원)', value: (g: Group) => g.executed },
      { header: '이월액(천원)', value: (g: Group) => g.carryover },
      { header: '불용액(천원)', value: (g: Group) => g.unused },
      { header: '집행률(%)', value: (g: Group) => (rate(g) * 100).toFixed(1) },
    ];
    exportWorkbook(`예산분석_${committee}`, [
      makeSheet('부서별', byDept, groupCols),
      makeSheet('분야별', byField, groupCols),
    ]);
  }

  const maxBudget = Math.max(1, ...byDept.map((g) => g.budget));

  function GroupTable({ title, rows }: { title: string; rows: Group[] }) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-bold text-[#1F4E79] mb-3">{title}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th className="py-2 px-2 font-semibold">구분</th>
                  <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">예산현액</th>
                  <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">집행액</th>
                  <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">불용액</th>
                  <th className="py-2 px-2 font-semibold whitespace-nowrap">집행률</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  const r = rate(g);
                  const barColor = r < 0.7 ? '#C62828' : r < 0.9 ? '#B45309' : '#2E7D32';
                  return (
                    <tr key={g.key} className="border-b border-gray-100">
                      <td className="py-2 px-2 text-gray-800">
                        {g.key}
                        <span className="ml-1 text-xs text-gray-400">({g.count})</span>
                      </td>
                      <td className="py-2 px-2 text-right text-gray-900 whitespace-nowrap">
                        {won(g.budget)}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-700 whitespace-nowrap">
                        {won(g.executed)}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-700 whitespace-nowrap">
                        {won(g.unused)}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${Math.min(100, r * 100)}%`,
                                backgroundColor: barColor,
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-600 w-12 text-right">
                            {pct(r)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const summaryCards = [
    { label: '예산현액', value: won(totals.budget), color: '#1F4E79' },
    { label: '집행액', value: won(totals.executed), color: '#2E7D32', sub: `집행률 ${pct(totals.rate)}` },
    { label: '이월액', value: won(totals.carryover), color: '#B45309' },
    { label: '불용액', value: won(totals.unused), color: '#C62828' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#1F4E79]">
            분석자료{committee ? ` — ${committee}` : ''}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            예산·집행 결과를 부서별·분야별로 집계하고 이상 징후를 자동으로 표시합니다. 발견한 항목은{' '}
            <Link href="/query" className="text-[#1F4E79] underline">
              AI 질의서
            </Link>
            로 옮겨 활용하세요.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="전체">전체 연도</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}년
              </option>
            ))}
          </select>
          <button
            onClick={handleExport}
            disabled={scoped.length === 0}
            className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
          >
            엑셀 저장
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center">불러오는 중...</p>
      ) : scoped.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-sm text-gray-500">
            분석할 예산 자료가 없습니다.{' '}
            <Link href="/budget" className="text-[#1F4E79] underline">
              예산 자료에서 추가하기 →
            </Link>
          </p>
        </div>
      ) : (
        <>
          {/* 요약 카드 + 전체 집행 막대 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {summaryCards.map((c) => (
              <div key={c.label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                <p className="text-xs text-gray-500">{c.label}</p>
                <p className="text-lg font-bold mt-1" style={{ color: c.color }}>
                  {c.value}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{c.sub ?? '천원'}</p>
              </div>
            ))}
          </div>

          {/* 이상 징후 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h2 className="text-sm font-bold text-[#1F4E79] mb-3">⚠ 이상 징후</h2>
            {flags.low.length === 0 && flags.over.length === 0 && flags.idle.length === 0 ? (
              <p className="text-sm text-[#2E7D32] py-2">✓ 특이사항이 발견되지 않았습니다.</p>
            ) : (
              <div className="space-y-4">
                {([
                  { title: '저조한 집행 (집행률 70% 미만)', list: flags.low, color: '#C62828', kind: '저조집행' as const },
                  { title: '초과 집행 (집행액 > 예산현액)', list: flags.over, color: '#6A1B9A', kind: '초과집행' as const },
                  { title: '불용액 과다 (예산의 20% 이상)', list: flags.idle, color: '#B45309', kind: '불용과다' as const },
                ])
                  .filter((s) => s.list.length > 0)
                  .map((s) => (
                    <div key={s.title}>
                      <p className="text-xs font-semibold mb-1" style={{ color: s.color }}>
                        {s.title} · {s.list.length}건
                      </p>
                      <ul className="space-y-1">
                        {s.list.map((r) => {
                          const exRate = r.budget > 0 ? r.executed / r.budget : 0;
                          const unused = Math.max(0, r.budget - r.executed - r.carryover);
                          const regKey = `${r.id}-${s.kind}`;
                          const st = regState[regKey];
                          return (
                            <li
                              key={r.id}
                              className="text-sm text-gray-700 flex items-center justify-between gap-2 border-l-2 pl-2"
                              style={{ borderColor: s.color }}
                            >
                              <span className="min-w-0 flex-1 truncate">
                                <span className="text-gray-500">{r.dept ?? '—'}</span> · {r.program}
                              </span>
                              <span className="flex items-center gap-2 whitespace-nowrap">
                                <span className="text-xs text-gray-500">
                                  집행률 {pct(exRate)} · 불용 {won(unused)}천원
                                </span>
                                {st === 'done' ? (
                                  <Link
                                    href="/issues"
                                    className="text-xs font-medium text-[#2E7D32] hover:underline"
                                  >
                                    ✓ 등록됨
                                  </Link>
                                ) : (
                                  <button
                                    onClick={() => registerIssue(r, s.kind)}
                                    disabled={st === 'saving'}
                                    className="rounded border border-[#1F4E79] px-2 py-0.5 text-xs font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors disabled:opacity-40"
                                  >
                                    {st === 'saving' ? '등록 중…' : '지적사항 등록'}
                                  </button>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                <div className="flex items-center gap-4 pt-2 flex-wrap">
                  <Link
                    href="/query"
                    className="inline-block text-sm font-medium text-[#1F4E79] hover:underline"
                  >
                    이 항목들로 질의서 작성하기 →
                  </Link>
                  <Link
                    href="/issues"
                    className="inline-block text-sm font-medium text-[#1F4E79] hover:underline"
                  >
                    지적사항 관리로 이동 →
                  </Link>
                  <button
                    onClick={generateMaterialDraft}
                    disabled={reqBusy}
                    className="rounded bg-[#6A1B9A] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition disabled:opacity-50"
                  >
                    {reqBusy ? '작성 중…' : '이상 항목으로 자료요구서 AI 초안'}
                  </button>
                </div>

                {(reqMsg || reqDraft) && (
                  <div className="rounded-lg border border-[#6A1B9A]/30 bg-[#6A1B9A]/5 p-3 space-y-2">
                    {reqMsg && (
                      <p className={`text-xs ${reqBusy ? 'text-[#B45309]' : 'text-[#2E7D32]'}`}>
                        {reqMsg}
                      </p>
                    )}
                    {reqDraft && (
                      <>
                        <p className="text-sm font-semibold text-[#6A1B9A]">{reqDraft.title}</p>
                        <ol className="list-decimal pl-5 space-y-0.5 text-sm text-gray-700">
                          {reqDraft.items.map((it, i) => (
                            <li key={i}>{it}</li>
                          ))}
                        </ol>
                        <p className="text-xs text-gray-500">
                          AI 초안은 참고용입니다. 저장 후 자료요구 화면에서 부서·기한 등을 보완하세요.
                        </p>
                        <div className="flex items-center gap-3">
                          {reqSaved ? (
                            <Link
                              href="/docs"
                              className="text-sm font-medium text-[#2E7D32] hover:underline"
                            >
                              ✓ 저장됨 · 자료요구 화면으로 이동 →
                            </Link>
                          ) : (
                            <button
                              onClick={saveMaterialDraft}
                              disabled={reqSaving}
                              className="rounded bg-[#1F4E79] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#163a5f] transition disabled:opacity-50"
                            >
                              {reqSaving ? '저장 중…' : '자료요구로 저장'}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 부서별 막대 비교 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h2 className="text-sm font-bold text-[#1F4E79] mb-3">부서별 예산 규모</h2>
            <div className="space-y-2">
              {byDept.map((g) => (
                <div key={g.key} className="flex items-center gap-2">
                  <span className="w-28 text-xs text-gray-600 truncate text-right">{g.key}</span>
                  <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded bg-[#1F4E79] flex items-center justify-end pr-2"
                      style={{ width: `${(g.budget / maxBudget) * 100}%` }}
                    >
                      <span className="text-[10px] text-white font-medium whitespace-nowrap">
                        {won(g.budget)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <GroupTable title="부서별 집행 현황" rows={byDept} />
            <GroupTable title="분야별 집행 현황" rows={byField} />
          </div>

          <Lofin365Links />
        </>
      )}
    </div>
  );
}
