'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import type { MaterialRequest } from '@/lib/types';

const NO_DEPT = '부서 미지정';

function todayKorean(): string {
  const d = new Date();
  return `${d.getFullYear()}.  ${String(d.getMonth() + 1).padStart(2, '0')}.  ${String(
    d.getDate(),
  ).padStart(2, '0')}.`;
}

export default function DocsPrintPage() {
  const { committee } = useCommittee();
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('material_requests')
      .select('*')
      .eq('committee', committee)
      .order('dept')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Error fetching requests:', error);
      setRequests([]);
    } else {
      setRequests((data as MaterialRequest[]) ?? []);
    }
    setLoading(false);
  }, [committee]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // 부서별 그룹
  const grouped = useMemo(() => {
    const map = new Map<string, MaterialRequest[]>();
    for (const r of requests) {
      const key = (r.dept && r.dept.trim()) || NO_DEPT;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  }, [requests]);

  // 부서 목록이 바뀌면 전체 선택 기본값
  useEffect(() => {
    setSelected(new Set(grouped.map(([dept]) => dept)));
  }, [grouped]);

  const toggle = (dept: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const allSelected = grouped.length > 0 && selected.size === grouped.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(grouped.map(([dept]) => dept)));
  };

  const visible = grouped.filter(([dept]) => selected.has(dept));
  const dateStr = todayKorean();

  return (
    <div className="p-6 space-y-6">
      {/* 도구 바 (인쇄 시 숨김) */}
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h1 className="text-xl font-bold text-[#1F4E79]">
            자료요구서 출력{committee ? ` — ${committee}` : ''}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            부서별로 요구 항목을 모아 공문 양식으로 인쇄합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/docs"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ← 자료요구로
          </Link>
          <button
            onClick={() => window.print()}
            disabled={visible.length === 0}
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors disabled:opacity-40"
          >
            인쇄 / PDF 저장
          </button>
        </div>
      </div>

      {/* 부서 선택 (인쇄 시 숨김) */}
      {!loading && grouped.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 print:hidden">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">출력할 부서 선택</p>
            <button
              onClick={toggleAll}
              className="text-sm text-[#1F4E79] font-medium hover:underline"
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.map(([dept, items]) => (
              <label
                key={dept}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(dept)}
                  onChange={() => toggle(dept)}
                  className="rounded border-gray-300"
                />
                <span className="truncate">
                  {dept} <span className="text-gray-400">({items.length})</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="text-gray-500">불러오는 중...</p>}

      {!loading && grouped.length === 0 && (
        <p className="text-gray-500">출력할 자료요구가 없습니다.</p>
      )}

      {!loading && grouped.length > 0 && visible.length === 0 && (
        <p className="text-gray-500 print:hidden">선택된 부서가 없습니다.</p>
      )}

      {/* 부서별 공문 */}
      <div className="space-y-8">
        {visible.map(([dept, items]) => (
          <article
            key={dept}
            className="report-doc bg-white rounded-lg border border-gray-200 shadow-sm p-10 print:border-0 print:shadow-none print:p-0 print:break-after-page print:break-inside-avoid"
          >
            <header className="text-center border-b-2 border-gray-800 pb-4 mb-6">
              <p className="text-sm text-gray-500 mb-1">경기도의회 {committee}</p>
              <h2 className="text-2xl font-bold tracking-[0.3em] text-gray-900">
                자 료 요 구 서
              </h2>
            </header>

            <div className="text-[15px] text-gray-900 space-y-1 mb-5">
              <p>
                <span className="inline-block w-20 font-semibold">수&nbsp;&nbsp;&nbsp;&nbsp;신</span>
                : {dept} 귀하
              </p>
              <p>
                <span className="inline-block w-20 font-semibold">제&nbsp;&nbsp;&nbsp;&nbsp;목</span>
                : {committee} 행정사무감사 관련 자료 요구
              </p>
            </div>

            <p className="text-[15px] leading-7 text-gray-900 mb-5">
              우리 위원회의 행정사무감사와 관련하여 아래와 같이 자료 제출을 요구하오니,
              제출기한 내에 협조하여 주시기 바랍니다.
            </p>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-400 px-2 py-2 w-12 text-center">번호</th>
                  <th className="border border-gray-400 px-2 py-2 text-left">요구자료명</th>
                  <th className="border border-gray-400 px-2 py-2 w-24 text-center">요구의원</th>
                  <th className="border border-gray-400 px-2 py-2 w-28 text-center">제출기한</th>
                  <th className="border border-gray-400 px-2 py-2 w-32 text-left">비고</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={r.id}>
                    <td className="border border-gray-400 px-2 py-2 text-center align-top">
                      {i + 1}
                    </td>
                    <td className="border border-gray-400 px-2 py-2 align-top whitespace-pre-wrap">
                      {r.title}
                    </td>
                    <td className="border border-gray-400 px-2 py-2 text-center align-top">
                      {r.member ?? '-'}
                    </td>
                    <td className="border border-gray-400 px-2 py-2 text-center align-top">
                      {r.due_date ?? '-'}
                    </td>
                    <td className="border border-gray-400 px-2 py-2 align-top whitespace-pre-wrap">
                      {r.note ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-[13px] text-gray-500 mt-2">총 {items.length}건</p>

            <div className="text-center mt-12 space-y-6">
              <p className="text-[15px] text-gray-900">{dateStr}</p>
              <p className="text-xl font-bold tracking-[0.2em] text-gray-900">
                경기도의회 {committee} 위원장
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
