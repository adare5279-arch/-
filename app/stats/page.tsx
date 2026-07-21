'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportWorkbook, makeSheet } from '@/lib/exportXlsx';
import type { MaterialRequest, Issue, Witness } from '@/lib/types';

type MemberStat = {
  member: string;
  total: number;
  submitted: number;
  rate: number;
};

type DeptStat = {
  dept: string;
  requests: number;
  issues: number;
  issuesDone: number;
  witnesses: number;
};

export default function StatsPage() {
  const { committee } = useCommittee();
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!committee) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [reqRes, issRes, witRes] = await Promise.all([
        supabase.from('material_requests').select('*').eq('committee', committee),
        supabase.from('issues').select('*').eq('committee', committee),
        supabase.from('witnesses').select('*').eq('committee', committee),
      ]);
      if (cancelled) return;
      setRequests((reqRes.data as MaterialRequest[]) ?? []);
      setIssues((issRes.data as Issue[]) ?? []);
      setWitnesses((witRes.data as Witness[]) ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [committee]);

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  const memberStats: MemberStat[] = useMemo(() => {
    const map = new Map<string, { total: number; submitted: number }>();
    for (const r of requests) {
      const key = r.member?.trim();
      if (!key) continue;
      const cur = map.get(key) ?? { total: 0, submitted: 0 };
      cur.total += 1;
      if (r.status === '제출완료') cur.submitted += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([member, v]) => ({
        member,
        total: v.total,
        submitted: v.submitted,
        rate: pct(v.submitted, v.total),
      }))
      .sort((a, b) => b.total - a.total);
  }, [requests]);

  const deptStats: DeptStat[] = useMemo(() => {
    const map = new Map<string, DeptStat>();
    const get = (d: string) =>
      map.get(d) ?? { dept: d, requests: 0, issues: 0, issuesDone: 0, witnesses: 0 };

    for (const r of requests) {
      const d = r.dept?.trim();
      if (!d) continue;
      const s = get(d);
      s.requests += 1;
      map.set(d, s);
    }
    for (const i of issues) {
      const d = i.dept?.trim();
      if (!d) continue;
      const s = get(d);
      s.issues += 1;
      if (i.proc === '처리완료') s.issuesDone += 1;
      map.set(d, s);
    }
    for (const w of witnesses) {
      const d = w.org?.trim();
      if (!d) continue;
      const s = get(d);
      s.witnesses += 1;
      map.set(d, s);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.requests + b.issues - (a.requests + a.issues),
    );
  }, [requests, issues, witnesses]);

  const maxMemberTotal = Math.max(1, ...memberStats.map((m) => m.total));
  const maxDeptTotal = Math.max(
    1,
    ...deptStats.map((d) => d.requests + d.issues + d.witnesses),
  );

  function handleExport() {
    exportWorkbook(`활동통계_${committee}`, [
      makeSheet('의원별', memberStats, [
        { header: '의원', value: (m) => m.member },
        { header: '자료요구 건수', value: (m) => m.total },
        { header: '제출완료', value: (m) => m.submitted },
        { header: '제출률(%)', value: (m) => m.rate },
      ]),
      makeSheet('부서별', deptStats, [
        { header: '부서', value: (d) => d.dept },
        { header: '자료요구', value: (d) => d.requests },
        { header: '지적사항', value: (d) => d.issues },
        { header: '지적 처리완료', value: (d) => d.issuesDone },
        { header: '증인·참고인', value: (d) => d.witnesses },
      ]),
    ]);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#1F4E79]">
          활동 통계{committee ? ` — ${committee}` : ''}
        </h1>
        <button
          onClick={handleExport}
          disabled={loading || (memberStats.length === 0 && deptStats.length === 0)}
          className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
        >
          통계 엑셀 저장
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm py-8 text-center">불러오는 중...</p>
      ) : (
        <>
          {/* 의원별 자료요구 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
            <h2 className="text-base font-semibold text-[#1F4E79]">의원별 자료요구 활동</h2>
            {memberStats.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                의원이 지정된 자료요구가 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-700">
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">의원</th>
                      <th className="py-2 px-3 font-semibold w-1/2">자료요구 건수</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap text-center">제출완료</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap text-center">제출률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberStats.map((m) => (
                      <tr key={m.member} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-800 whitespace-nowrap font-medium">{m.member}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <div className="h-3 rounded bg-gray-100 flex-1 overflow-hidden">
                              <div
                                className="h-full rounded bg-[#1F4E79]"
                                style={{ width: `${(m.total / maxMemberTotal) * 100}%` }}
                              />
                            </div>
                            <span className="text-gray-700 w-10 text-right">{m.total}건</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center text-gray-700">{m.submitted}</td>
                        <td className="py-2 px-3 text-center font-medium" style={{ color: m.rate >= 70 ? '#2E7D32' : m.rate >= 40 ? '#B45309' : '#C62828' }}>
                          {m.rate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 부서별 통계 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
            <h2 className="text-base font-semibold text-[#1F4E79]">부서별 활동</h2>
            <p className="text-xs text-gray-400">
              막대는 자료요구·지적사항·증인 합계 기준입니다.
            </p>
            {deptStats.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                집계할 부서 데이터가 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-700">
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">부서</th>
                      <th className="py-2 px-3 font-semibold w-2/5">활동량</th>
                      <th className="py-2 px-3 font-semibold text-center whitespace-nowrap">자료요구</th>
                      <th className="py-2 px-3 font-semibold text-center whitespace-nowrap">지적사항</th>
                      <th className="py-2 px-3 font-semibold text-center whitespace-nowrap">처리완료</th>
                      <th className="py-2 px-3 font-semibold text-center whitespace-nowrap">증인·참고인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptStats.map((d) => {
                      const sum = d.requests + d.issues + d.witnesses;
                      return (
                        <tr key={d.dept} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-800 font-medium">{d.dept}</td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <div className="h-3 rounded bg-gray-100 flex-1 overflow-hidden flex">
                                <div className="h-full bg-[#1F4E79]" style={{ width: `${(d.requests / maxDeptTotal) * 100}%` }} />
                                <div className="h-full bg-[#C62828]" style={{ width: `${(d.issues / maxDeptTotal) * 100}%` }} />
                                <div className="h-full bg-[#B45309]" style={{ width: `${(d.witnesses / maxDeptTotal) * 100}%` }} />
                              </div>
                              <span className="text-gray-700 w-10 text-right">{sum}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center text-gray-700">{d.requests}</td>
                          <td className="py-2 px-3 text-center text-gray-700">{d.issues}</td>
                          <td className="py-2 px-3 text-center text-gray-700">
                            {d.issues > 0 ? `${d.issuesDone} (${pct(d.issuesDone, d.issues)}%)` : '—'}
                          </td>
                          <td className="py-2 px-3 text-center text-gray-700">{d.witnesses}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex gap-3 pt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[#1F4E79]" />자료요구</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[#C62828]" />지적사항</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[#B45309]" />증인·참고인</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
