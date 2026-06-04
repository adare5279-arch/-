'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportSheet } from '@/lib/exportXlsx';
import { ISSUE_TYPES } from '@/lib/types';
import type { Issue, Witness, MaterialRequest } from '@/lib/types';

export default function ReportPage() {
  const { committee } = useCommittee();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [issRes, witRes, reqRes] = await Promise.all([
        supabase.from('issues').select('*').eq('committee', committee).order('date'),
        supabase.from('witnesses').select('*').eq('committee', committee).order('dt'),
        supabase.from('material_requests').select('*').eq('committee', committee),
      ]);
      if (cancelled) return;
      setIssues((issRes.data as Issue[]) ?? []);
      setWitnesses((witRes.data as Witness[]) ?? []);
      setRequests((reqRes.data as MaterialRequest[]) ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [committee]);

  const typeCounts = ISSUE_TYPES.map((t) => ({
    type: t,
    count: issues.filter((i) => i.type === t).length,
  })).filter((x) => x.count > 0);

  const procDone = issues.filter((i) => i.proc === '처리완료').length;
  const reqDone = requests.filter((r) => r.status === '제출완료').length;
  const witDone = witnesses.filter((w) => w.attend === '출석완료').length;

  function handleExport() {
    exportSheet(`결과보고서_${committee}`, '지적사항', issues, [
      { header: '일자', value: (r) => r.date ?? '' },
      { header: '부서', value: (r) => r.dept ?? '' },
      { header: '유형', value: (r) => r.type },
      { header: '지적내용', value: (r) => r.content },
      { header: '시정·조치요구', value: (r) => r.action ?? '' },
      { header: '처리상태', value: (r) => r.proc },
    ]);
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 py-4 text-center">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <h1 className="text-xl font-bold text-[#1F4E79]">결과보고서</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={issues.length === 0}
            className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
          >
            엑셀 저장
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
          >
            인쇄 / PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-6">
        <div className="text-center border-b border-gray-200 pb-4">
          <h2 className="text-2xl font-bold text-gray-900">행정사무감사 결과보고서</h2>
          <p className="text-sm text-gray-600 mt-1">{committee}</p>
          <p className="text-xs text-gray-400 mt-1">
            작성일: {new Date().toISOString().slice(0, 10)}
          </p>
        </div>

        {/* Summary */}
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-[#1F4E79]">Ⅰ. 감사 개요</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="지적사항" value={`${issues.length}건`} sub={`처리완료 ${procDone}`} />
            <SummaryCard label="자료요구" value={`${requests.length}건`} sub={`제출완료 ${reqDone}`} />
            <SummaryCard label="증인·참고인" value={`${witnesses.length}명`} sub={`출석완료 ${witDone}`} />
            <SummaryCard
              label="유형 분포"
              value={`${typeCounts.length}종`}
              sub={typeCounts.map((t) => `${t.type}${t.count}`).join(' ')}
            />
          </div>
        </section>

        {/* Issues */}
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-[#1F4E79]">Ⅱ. 지적사항 및 시정요구</h3>
          {issues.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">등록된 지적사항이 없습니다.</p>
          ) : (
            <table className="w-full text-sm border border-gray-300 border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="border border-gray-300 py-2 px-3 font-semibold w-10">번호</th>
                  <th className="border border-gray-300 py-2 px-3 font-semibold whitespace-nowrap">부서</th>
                  <th className="border border-gray-300 py-2 px-3 font-semibold whitespace-nowrap">유형</th>
                  <th className="border border-gray-300 py-2 px-3 font-semibold">지적내용</th>
                  <th className="border border-gray-300 py-2 px-3 font-semibold">시정·조치요구</th>
                  <th className="border border-gray-300 py-2 px-3 font-semibold whitespace-nowrap">처리</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((r, idx) => (
                  <tr key={r.id} className="align-top">
                    <td className="border border-gray-300 py-2 px-3 text-center text-gray-700">{idx + 1}</td>
                    <td className="border border-gray-300 py-2 px-3 text-gray-700 whitespace-nowrap">{r.dept ?? '—'}</td>
                    <td className="border border-gray-300 py-2 px-3 text-gray-700 whitespace-nowrap">{r.type}</td>
                    <td className="border border-gray-300 py-2 px-3 text-gray-800">{r.content}</td>
                    <td className="border border-gray-300 py-2 px-3 text-gray-700">{r.action ?? '—'}</td>
                    <td className="border border-gray-300 py-2 px-3 text-gray-700 whitespace-nowrap">{r.proc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Witnesses */}
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-[#1F4E79]">Ⅲ. 증인·참고인</h3>
          {witnesses.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">등록된 증인·참고인이 없습니다.</p>
          ) : (
            <table className="w-full text-sm border border-gray-300 border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="border border-gray-300 py-2 px-3 font-semibold whitespace-nowrap">구분</th>
                  <th className="border border-gray-300 py-2 px-3 font-semibold whitespace-nowrap">성명</th>
                  <th className="border border-gray-300 py-2 px-3 font-semibold">소속·직위</th>
                  <th className="border border-gray-300 py-2 px-3 font-semibold whitespace-nowrap">일시</th>
                  <th className="border border-gray-300 py-2 px-3 font-semibold whitespace-nowrap">출석</th>
                </tr>
              </thead>
              <tbody>
                {witnesses.map((r) => (
                  <tr key={r.id}>
                    <td className="border border-gray-300 py-2 px-3 text-gray-700 whitespace-nowrap">{r.kind}</td>
                    <td className="border border-gray-300 py-2 px-3 text-gray-800 whitespace-nowrap">{r.name}</td>
                    <td className="border border-gray-300 py-2 px-3 text-gray-700">
                      {[r.org, r.pos].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="border border-gray-300 py-2 px-3 text-gray-700 whitespace-nowrap">{r.dt ?? '—'}</td>
                    <td className="border border-gray-300 py-2 px-3 text-gray-700 whitespace-nowrap">{r.attend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-2xl font-bold text-[#1F4E79]">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}
