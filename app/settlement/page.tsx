'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { updateRows } from '@/lib/dataApi';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportSheet } from '@/lib/exportXlsx';
import type { BudgetItem, Department } from '@/lib/types';
import { useFocusRow } from '@/lib/useFocusRow';
import Lofin365Links from '@/components/Lofin365Links';

const won = (n: number) => n.toLocaleString('ko-KR');
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// 집행률 색상: 낮으면 위험(빨강), 100% 초과면 경고(보라), 정상 녹색
function rateColor(rate: number, over: boolean): string {
  if (over) return '#6A1B9A';
  if (rate < 0.7) return '#C62828';
  if (rate < 0.9) return '#B45309';
  return '#2E7D32';
}

export default function SettlementPage() {
  const { committee } = useCommittee();

  const [items, setItems] = useState<BudgetItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>('전체');
  const [deptFilter, setDeptFilter] = useState<string>('전체');
  const [q, setQ] = useState('');
  // 인라인 편집 중인 값 (id -> {executed, carryover})
  const [edits, setEdits] = useState<Record<number, { executed: string; carryover: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const focusId = useFocusRow(!loading);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('budget_items')
      .select('*')
      .eq('committee', committee)
      .order('year', { ascending: false })
      .order('dept')
      .order('id');
    if (error) {
      console.error('Error fetching budget_items:', error);
      setItems([]);
    } else {
      setItems((data as BudgetItem[]) ?? []);
    }
  }, [committee]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const deptRes = await supabase
        .from('departments')
        .select('*')
        .eq('committee', committee)
        .order('name');
      if (cancelled) return;
      setDepartments((deptRes.data as Department[]) ?? []);
      await fetchItems();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [committee, fetchItems]);

  function startEdit(r: BudgetItem) {
    setEdits((e) => ({
      ...e,
      [r.id]: { executed: String(r.executed), carryover: String(r.carryover) },
    }));
  }

  function cancelEdit(id: number) {
    setEdits((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });
  }

  async function saveEdit(id: number) {
    const edit = edits[id];
    if (!edit) return;
    const executed = Number(edit.executed) || 0;
    const carryover = Number(edit.carryover) || 0;
    setSavingId(id);
    const prev = items;
    setItems((rs) => rs.map((r) => (r.id === id ? { ...r, executed, carryover } : r)));
    const { error } = await updateRows('budget_items', { executed, carryover }, { id });
    setSavingId(null);
    if (error) {
      console.error('Error saving settlement:', error);
      setItems(prev);
      alert('저장에 실패했습니다.');
      return;
    }
    cancelEdit(id);
  }

  const years = Array.from(new Set(items.map((r) => r.year))).sort((a, b) => b - a);

  const filtered = items.filter((r) => {
    if (yearFilter !== '전체' && String(r.year) !== yearFilter) return false;
    if (deptFilter !== '전체' && r.dept !== deptFilter) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const hay = `${r.program} ${r.dept ?? ''} ${r.field ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const sumBudget = filtered.reduce((s, r) => s + r.budget, 0);
  const sumExecuted = filtered.reduce((s, r) => s + r.executed, 0);
  const sumCarryover = filtered.reduce((s, r) => s + r.carryover, 0);
  const sumUnused = filtered.reduce((s, r) => s + Math.max(0, r.budget - r.executed - r.carryover), 0);
  const totalRate = sumBudget > 0 ? sumExecuted / sumBudget : 0;

  const filterActive = q.trim() !== '' || yearFilter !== '전체' || deptFilter !== '전체';

  function resetFilters() {
    setQ('');
    setYearFilter('전체');
    setDeptFilter('전체');
  }

  function handleExport() {
    exportSheet(`결산자료_${committee}`, '결산자료', filtered, [
      { header: '회계연도', value: (r) => r.year },
      { header: '분야', value: (r) => r.field ?? '' },
      { header: '소관부서', value: (r) => r.dept ?? '' },
      { header: '사업명', value: (r) => r.program },
      { header: '예산현액(천원)', value: (r) => r.budget },
      { header: '집행액(천원)', value: (r) => r.executed },
      { header: '이월액(천원)', value: (r) => r.carryover },
      { header: '불용액(천원)', value: (r) => Math.max(0, r.budget - r.executed - r.carryover) },
      { header: '집행률(%)', value: (r) => (r.budget > 0 ? ((r.executed / r.budget) * 100).toFixed(1) : '') },
    ]);
  }

  const inputCls =
    'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';
  const numCls =
    'w-28 rounded border border-[#1F4E79]/50 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  const cards: { label: string; value: string; sub?: string; color: string }[] = [
    { label: '예산현액 합계', value: `${won(sumBudget)}`, sub: '천원', color: '#1F4E79' },
    { label: '집행액 합계', value: `${won(sumExecuted)}`, sub: `집행률 ${pct(totalRate)}`, color: '#2E7D32' },
    { label: '이월액 합계', value: `${won(sumCarryover)}`, sub: '천원', color: '#B45309' },
    { label: '불용액 합계', value: `${won(sumUnused)}`, sub: '천원', color: '#C62828' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#1F4E79]">
            결산자료{committee ? ` — ${committee}` : ''}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            사업별 집행액·이월액을 입력하면 집행률·불용액이 자동 계산됩니다. 사업은{' '}
            <Link href="/budget" className="text-[#1F4E79] underline">
              예산 자료
            </Link>
            에서 추가합니다.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
        >
          엑셀 저장
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-lg font-bold mt-1" style={{ color: c.color }}>
              {c.value}
            </p>
            {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-600 flex flex-col gap-1 grow min-w-[160px]">
          검색
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="사업명·부서·분야"
            className={inputCls}
          />
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          회계연도
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className={inputCls}>
            <option value="전체">전체</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          소관부서
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={inputCls}>
            <option value="전체">전체</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {filterActive && (
          <button
            onClick={resetFilters}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            초기화
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            결산할 예산 사업이 없습니다.{' '}
            <Link href="/budget" className="text-[#1F4E79] underline">
              예산 자료에서 추가하기 →
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <p className="text-sm text-gray-600 mb-3">
              총 {filtered.length}개 사업{filterActive ? ` (전체 ${items.length}개)` : ''}
            </p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">소관부서</th>
                  <th className="py-2 px-3 font-semibold">사업명</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">예산현액</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">집행액</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">이월액</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">불용액</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">집행률</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const editing = edits[r.id] != null;
                  const unused = Math.max(0, r.budget - r.executed - r.carryover);
                  const over = r.executed > r.budget;
                  const rate = r.budget > 0 ? r.executed / r.budget : 0;
                  return (
                    <tr
                      key={r.id}
                      id={`row-${r.id}`}
                      className={`border-b border-gray-100 transition-colors ${
                        focusId === r.id ? 'bg-amber-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.dept ?? '—'}</td>
                      <td className="py-2 px-3 text-gray-800">
                        {r.program}
                        <span className="ml-1 text-xs text-gray-400">({r.year})</span>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-900 whitespace-nowrap">
                        {won(r.budget)}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {editing ? (
                          <input
                            type="number"
                            value={edits[r.id].executed}
                            onChange={(e) =>
                              setEdits((s) => ({
                                ...s,
                                [r.id]: { ...s[r.id], executed: e.target.value },
                              }))
                            }
                            className={numCls}
                          />
                        ) : (
                          <span className="text-gray-900">{won(r.executed)}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {editing ? (
                          <input
                            type="number"
                            value={edits[r.id].carryover}
                            onChange={(e) =>
                              setEdits((s) => ({
                                ...s,
                                [r.id]: { ...s[r.id], carryover: e.target.value },
                              }))
                            }
                            className={numCls}
                          />
                        ) : (
                          <span className="text-gray-600">{won(r.carryover)}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap text-gray-700">
                        {won(unused)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className="inline-block text-xs font-semibold rounded px-2 py-0.5 text-white"
                          style={{ backgroundColor: rateColor(rate, over) }}
                        >
                          {pct(rate)}
                          {over ? ' 초과' : ''}
                        </span>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {editing ? (
                          <span className="flex gap-2">
                            <button
                              onClick={() => saveEdit(r.id)}
                              disabled={savingId === r.id}
                              className="text-xs text-[#2E7D32] font-medium hover:underline disabled:opacity-50"
                            >
                              {savingId === r.id ? '저장중' : '저장'}
                            </button>
                            <button
                              onClick={() => cancelEdit(r.id)}
                              className="text-xs text-gray-500 hover:underline"
                            >
                              취소
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => startEdit(r)}
                            className="text-xs text-[#1F4E79] hover:underline"
                          >
                            집행 입력
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 font-semibold text-gray-800">
                  <td className="py-2 px-3" colSpan={2}>
                    합계
                  </td>
                  <td className="py-2 px-3 text-right text-[#1F4E79]">{won(sumBudget)}</td>
                  <td className="py-2 px-3 text-right text-[#2E7D32]">{won(sumExecuted)}</td>
                  <td className="py-2 px-3 text-right text-[#B45309]">{won(sumCarryover)}</td>
                  <td className="py-2 px-3 text-right text-[#C62828]">{won(sumUnused)}</td>
                  <td className="py-2 px-3" colSpan={2}>
                    <span className="text-xs text-gray-500">평균 {pct(totalRate)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <Lofin365Links compact />
    </div>
  );
}
