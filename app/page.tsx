'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportWorkbook, makeSheet } from '@/lib/exportXlsx';
import AuditFlow from '@/components/AuditFlow';
import CitizenReport from '@/components/CitizenReport';
import type {
  MaterialRequest,
  Issue,
  Witness,
  Meeting,
  Member,
  Department,
} from '@/lib/types';

export default function DashboardPage() {
  const { committee } = useCommittee();

  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [meetingCount, setMeetingCount] = useState<number>(0);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!committee) return;

    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const [reqRes, meetRes, memRes, issueRes, witRes] = await Promise.all([
          supabase
            .from('material_requests')
            .select('*')
            .eq('committee', committee),
          supabase
            .from('meetings')
            .select('id', { count: 'exact', head: true })
            .eq('committee', committee),
          supabase
            .from('members')
            .select('id', { count: 'exact', head: true })
            .eq('committee', committee),
          supabase
            .from('issues')
            .select('id,proc,type')
            .eq('committee', committee),
          supabase
            .from('witnesses')
            .select('id,attend,kind')
            .eq('committee', committee),
        ]);

        if (cancelled) return;

        setRequests((reqRes.data as MaterialRequest[]) ?? []);
        setMeetingCount(meetRes.count ?? 0);
        setMemberCount(memRes.count ?? 0);
        setIssues((issueRes.data as Issue[]) ?? []);
        setWitnesses((witRes.data as Witness[]) ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [committee]);

  async function handleExportAll() {
    if (!committee || exporting) return;
    setExporting(true);
    try {
      const [reqRes, meetRes, memRes, deptRes, issueRes, witRes] = await Promise.all([
        supabase.from('material_requests').select('*').eq('committee', committee).order('created_at', { ascending: false }),
        supabase.from('meetings').select('*').eq('committee', committee).order('date', { ascending: false }),
        supabase.from('members').select('*').eq('committee', committee).order('id'),
        supabase.from('departments').select('*').eq('committee', committee).order('name'),
        supabase.from('issues').select('*').eq('committee', committee).order('date', { ascending: false }),
        supabase.from('witnesses').select('*').eq('committee', committee).order('dt', { ascending: false }),
      ]);

      const reqRows = (reqRes.data as MaterialRequest[]) ?? [];
      const meetRows = (meetRes.data as Meeting[]) ?? [];
      const memRows = (memRes.data as Member[]) ?? [];
      const deptRows = (deptRes.data as Department[]) ?? [];
      const issueRows = (issueRes.data as Issue[]) ?? [];
      const witRows = (witRes.data as Witness[]) ?? [];

      exportWorkbook(`행정사무감사_${committee}`, [
        makeSheet('자료요구', reqRows, [
          { header: '의원', value: r => r.member ?? '' },
          { header: '담당부서', value: r => r.dept ?? '' },
          { header: '요구자료명', value: r => r.title },
          { header: '요구일', value: r => r.req_date ?? '' },
          { header: '마감일', value: r => r.due_date ?? '' },
          { header: '상태', value: r => r.status },
          { header: '비고', value: r => r.note ?? '' },
        ]),
        makeSheet('지적사항', issueRows, [
          { header: '일자', value: r => r.date ?? '' },
          { header: '부서', value: r => r.dept ?? '' },
          { header: '유형', value: r => r.type },
          { header: '지적내용', value: r => r.content },
          { header: '조치요구', value: r => r.action ?? '' },
          { header: '처리상태', value: r => r.proc },
          { header: '첨부파일', value: r => r.file_name ?? '' },
        ]),
        makeSheet('증인참고인', witRows, [
          { header: '구분', value: r => r.kind },
          { header: '성명', value: r => r.name },
          { header: '소속', value: r => r.org ?? '' },
          { header: '직위', value: r => r.pos ?? '' },
          { header: '일시', value: r => r.dt ?? '' },
          { header: '출석', value: r => r.attend },
          { header: '연락처', value: r => r.phone ?? '' },
          { header: '비고', value: r => r.note ?? '' },
        ]),
        makeSheet('회의록', meetRows, [
          { header: '연도', value: m => m.year },
          { header: '위원회', value: m => m.committee },
          { header: '회의일자', value: m => m.date },
        ]),
        makeSheet('의원명부', memRows, [
          { header: '이름', value: m => m.name },
          { header: '직위', value: m => m.role },
          { header: '정당', value: m => m.party ?? '무소속' },
          { header: '선거구', value: m => m.district ?? '' },
        ]),
        makeSheet('소관부서', deptRows, [
          { header: '부서명', value: d => d.name },
          { header: '홈페이지', value: d => d.url ?? '' },
        ]),
      ]);
    } catch (e) {
      console.error('Error exporting all data:', e);
      alert('엑셀 내보내기에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeDaysLater = new Date(today);
  threeDaysLater.setDate(today.getDate() + 3);

  const totalCount = requests.length;
  const unsubmittedCount = requests.filter(r => r.status === '미제출').length;
  const submittedCount = requests.filter(r => r.status === '제출완료').length;
  const urgentCount = requests.filter(r => {
    if (r.status === '제출완료') return false;
    if (!r.due_date) return false;
    const due = new Date(r.due_date);
    due.setHours(0, 0, 0, 0);
    return due >= today && due <= threeDaysLater;
  }).length;

  const pendingRequests = requests.filter(
    r => r.status === '미제출' || r.status === '부분제출'
  );

  const kpiCards = [
    { label: '총 자료요구', value: totalCount, color: '#1F4E79' },
    { label: '미제출', value: unsubmittedCount, color: '#C62828' },
    { label: '제출완료', value: submittedCount, color: '#2E7D32' },
    { label: '마감임박', value: urgentCount, color: '#B45309' },
  ];

  // 감사 진행 현황 통계
  const issuesTotal = issues.length;
  const issuesDone = issues.filter(i => i.proc === '처리완료').length;
  const witnessTotal = witnesses.length;
  const witnessAttended = witnesses.filter(w => w.attend === '출석완료').length;

  const pct = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 100) : 0;

  const progressBars = [
    {
      label: '자료 제출률',
      done: submittedCount,
      total: totalCount,
      rate: pct(submittedCount, totalCount),
      color: '#2E7D32',
      caption: `${submittedCount} / ${totalCount}건 제출`,
    },
    {
      label: '지적사항 처리율',
      done: issuesDone,
      total: issuesTotal,
      rate: pct(issuesDone, issuesTotal),
      color: '#1F4E79',
      caption: `${issuesDone} / ${issuesTotal}건 처리완료`,
    },
    {
      label: '증인·참고인 출석률',
      done: witnessAttended,
      total: witnessTotal,
      rate: pct(witnessAttended, witnessTotal),
      color: '#B45309',
      caption: `${witnessAttended} / ${witnessTotal}명 출석`,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#1F4E79]">대시보드</h1>
          {committee && (
            <span className="text-base font-medium text-gray-600">— {committee}</span>
          )}
        </div>
        <button
          onClick={handleExportAll}
          disabled={loading || exporting}
          className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
        >
          {exporting ? '내보내는 중...' : '전체 엑셀 다운로드'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          불러오는 중...
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {kpiCards.map(card => (
              <div
                key={card.label}
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex flex-col gap-1"
              >
                <span className="text-xs text-gray-500">{card.label}</span>
                <span className="text-3xl font-bold" style={{ color: card.color }}>
                  {card.value}
                </span>
              </div>
            ))}
          </div>

          {/* Small stats row */}
          <div className="flex flex-wrap gap-6 text-sm text-gray-600">
            <span>
              회의록{' '}
              <strong className="text-[#1F4E79] font-semibold">{meetingCount}건</strong>
            </span>
            <span>
              의원{' '}
              <strong className="text-[#1F4E79] font-semibold">{memberCount}명</strong>
            </span>
            <span>
              지적사항{' '}
              <strong className="text-[#1F4E79] font-semibold">{issuesTotal}건</strong>
            </span>
            <span>
              증인·참고인{' '}
              <strong className="text-[#1F4E79] font-semibold">{witnessTotal}명</strong>
            </span>
          </div>

          {/* 감사 진행 현황 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
            <h2 className="text-base font-semibold text-[#1F4E79]">감사 진행 현황</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {progressBars.map(bar => (
                <div key={bar.label} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-600">{bar.label}</span>
                    <span
                      className="text-lg font-bold"
                      style={{ color: bar.color }}
                    >
                      {bar.rate}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${bar.rate}%`, backgroundColor: bar.color }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{bar.caption}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 행정사무감사 절차 도식 */}
          <AuditFlow />

          {/* 행정사무감사 도민제보 */}
          <CitizenReport />

          {/* Pending table */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
            <h2 className="text-base font-semibold text-[#1F4E79]">처리 대기 자료</h2>
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                처리 대기 중인 자료가 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500 text-left">
                      <th className="py-2 pr-4 font-medium">의원</th>
                      <th className="py-2 pr-4 font-medium">담당부서</th>
                      <th className="py-2 pr-4 font-medium">요구자료명</th>
                      <th className="py-2 pr-4 font-medium">마감일</th>
                      <th className="py-2 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map(r => {
                      const isOverdue = (() => {
                        if (!r.due_date) return false;
                        const due = new Date(r.due_date);
                        due.setHours(0, 0, 0, 0);
                        return due < today;
                      })();

                      const deptLabel = [r.dept_main, r.dept]
                        .filter(Boolean)
                        .join(' / ');

                      const statusColor: Record<string, string> = {
                        '미제출': '#C62828',
                        '부분제출': '#B45309',
                      };

                      return (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 pr-4 text-gray-800">{r.member ?? '—'}</td>
                          <td className="py-2 pr-4 text-gray-600">{deptLabel || '—'}</td>
                          <td className="py-2 pr-4 text-gray-800 max-w-xs truncate">{r.title}</td>
                          <td
                            className="py-2 pr-4 font-medium"
                            style={{ color: isOverdue ? '#C62828' : '#374151' }}
                          >
                            {r.due_date ?? '—'}
                            {isOverdue && (
                              <span className="ml-1 text-xs text-white bg-[#C62828] rounded px-1 py-0.5">
                                초과
                              </span>
                            )}
                          </td>
                          <td className="py-2">
                            <span
                              className="inline-block text-xs font-medium rounded px-2 py-0.5 text-white"
                              style={{ backgroundColor: statusColor[r.status] ?? '#555' }}
                            >
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex gap-3">
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-lg border border-[#1F4E79] bg-white px-4 py-2 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors"
            >
              자료 관리
            </Link>
            <Link
              href="/query"
              className="inline-flex items-center gap-2 rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
            >
              질의서 생성
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
