'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import type { MaterialRequest } from '@/lib/types';

export default function DashboardPage() {
  const { committee } = useCommittee();

  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [meetingCount, setMeetingCount] = useState<number>(0);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!committee) return;

    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const [reqRes, meetRes, memRes] = await Promise.all([
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
        ]);

        if (cancelled) return;

        setRequests((reqRes.data as MaterialRequest[]) ?? []);
        setMeetingCount(meetRes.count ?? 0);
        setMemberCount(memRes.count ?? 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [committee]);

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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-[#1F4E79]">대시보드</h1>
        {committee && (
          <span className="text-base font-medium text-gray-600">— {committee}</span>
        )}
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
          <div className="flex gap-6 text-sm text-gray-600">
            <span>
              회의록{' '}
              <strong className="text-[#1F4E79] font-semibold">{meetingCount}건</strong>
            </span>
            <span>
              의원{' '}
              <strong className="text-[#1F4E79] font-semibold">{memberCount}명</strong>
            </span>
          </div>

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
