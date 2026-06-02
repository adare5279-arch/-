'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import type { Meeting } from '@/lib/types';

type YearFilter = '전체' | 2023 | 2024 | 2025;

export default function MeetingsPage() {
  const { committee } = useCommittee();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<YearFilter>('전체');

  useEffect(() => {
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
        setMeetings((data as Meeting[]) ?? []);
      }
      setLoading(false);
    }

    fetchMeetings();
  }, [committee]);

  const yearButtons: YearFilter[] = ['전체', 2023, 2024, 2025];

  const filtered =
    yearFilter === '전체'
      ? meetings
      : meetings.filter((m) => m.year === yearFilter);

  return (
    <div className="p-6 space-y-6">
      {/* Heading */}
      <div>
        <h1 className="text-xl font-bold text-[#1F4E79]">
          회의록{committee ? ` — ${committee}` : ''}
        </h1>
      </div>

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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
