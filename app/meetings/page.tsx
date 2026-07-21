'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportSheet } from '@/lib/exportXlsx';
import MeetingStatementsModal from '@/components/MeetingStatementsModal';
import AudioMinutes from '@/components/AudioMinutes';
import DocMinutes from '@/components/DocMinutes';
import type { Meeting } from '@/lib/types';

type YearFilter = '전체' | number;

export default function MeetingsPage() {
  const { committee } = useCommittee();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<YearFilter>('전체');
  const [active, setActive] = useState<Meeting | null>(null);
  const [stmtCounts, setStmtCounts] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    if (!committee) return;
    async function fetchMeetings() {
      setLoading(true);
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('committee', committee)
        .order('year', { ascending: false })
        .order('date', { ascending: false });

      if (error) {
        console.error('Error fetching meetings:', error);
        setMeetings([]);
      } else {
        const list = (data as Meeting[]) ?? [];
        setMeetings(list);
        // 회의별 저장된 발언 요약 개수 집계
        const ids = list.map((m) => m.id);
        if (ids.length > 0) {
          const { data: stmts } = await supabase
            .from('meeting_statements')
            .select('meeting_id')
            .in('meeting_id', ids);
          const counts = new Map<number, number>();
          for (const r of (stmts as { meeting_id: number }[]) ?? []) {
            counts.set(r.meeting_id, (counts.get(r.meeting_id) ?? 0) + 1);
          }
          setStmtCounts(counts);
        } else {
          setStmtCounts(new Map());
        }
      }
      setLoading(false);

      // AI 데모 인용 등에서 ?focus=<meeting_id> 로 진입 시 해당 회의 발언 요약 자동 열기
      const focus = Number(new URLSearchParams(window.location.search).get('focus'));
      if (focus) {
        const target = ((data as Meeting[]) ?? []).find((m) => m.id === focus);
        if (target) setActive(target);
      }
    }

    fetchMeetings();
  }, [committee]);

  // 데이터에 존재하는 연도를 내림차순으로 동적 생성한다.
  // (하드코딩 제거 → 2026년 이후 회의록도 자동으로 필터 버튼에 나타남)
  const yearButtons: YearFilter[] = [
    '전체',
    ...Array.from(new Set(meetings.map((m) => m.year)))
      .filter((y): y is number => typeof y === 'number' && !Number.isNaN(y))
      .sort((a, b) => b - a),
  ];

  const filtered =
    yearFilter === '전체'
      ? meetings
      : meetings.filter((m) => m.year === yearFilter);

  function handleExport() {
    exportSheet(`회의록_${committee}`, '회의록', filtered, [
      { header: '연도', value: (m) => m.year },
      { header: '위원회', value: (m) => m.committee },
      { header: '회의일자', value: (m) => m.date },
    ]);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Heading */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#1F4E79]">
          회의록{committee ? ` — ${committee}` : ''}
        </h1>
        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
        >
          엑셀 저장
        </button>
      </div>

      {/* 녹음 자동 회의록 */}
      <AudioMinutes committee={committee} />

      {/* 문서 자동 회의록 */}
      <DocMinutes committee={committee} />

      {/* Year filter */}
      <div className="flex gap-2 flex-wrap">
        {yearButtons.map((y) => (
          <button
            key={String(y)}
            onClick={() => setYearFilter(y)}
            className={`px-3 py-1.5 text-sm rounded border transition-colors ${
              yearFilter === y
                ? 'bg-[#1F4E79] text-white border-[#1F4E79]'
                : 'bg-white text-[#1F4E79] border-gray-300 hover:border-[#1F4E79]'
            }`}
          >
            {String(y)}
          </button>
        ))}
      </div>

      {/* Card */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            해당 조건의 회의록이 없습니다.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-3">총 {filtered.length}건</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-2 px-3 font-semibold text-gray-700 whitespace-nowrap">연도</th>
                    <th className="py-2 px-3 font-semibold text-gray-700 whitespace-nowrap">위원회</th>
                    <th className="py-2 px-3 font-semibold text-gray-700 whitespace-nowrap">회의일자</th>
                    <th className="py-2 px-3 font-semibold text-gray-700 whitespace-nowrap">회의록</th>
                    <th className="py-2 px-3 font-semibold text-gray-700 whitespace-nowrap">의원별 발언 요약</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((meeting) => (
                    <tr
                      key={meeting.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-2 px-3 text-gray-800">{meeting.year}</td>
                      <td className="py-2 px-3 text-gray-800">{meeting.committee}</td>
                      <td className="py-2 px-3 text-gray-800 whitespace-nowrap">{meeting.date}</td>
                      <td className="py-2 px-3">
                        <a
                          href={`https://kms.ggc.go.kr/cms/mntsViewer.do?mntsId=${meeting.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1F4E79] underline hover:opacity-80 whitespace-nowrap"
                        >
                          원문 보기
                        </a>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <button
                          onClick={() => setActive(meeting)}
                          className="inline-flex items-center gap-1.5 rounded border border-[#1F4E79] px-2.5 py-1 text-xs font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors"
                        >
                          발언 요약
                          {(stmtCounts.get(meeting.id) ?? 0) > 0 && (
                            <span className="inline-block rounded-full bg-[#2E7D32] px-1.5 text-[10px] font-bold text-white">
                              {stmtCounts.get(meeting.id)}
                            </span>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {active && (
        <MeetingStatementsModal meeting={active} onClose={() => setActive(null)} />
      )}
    </div>
  );
}
