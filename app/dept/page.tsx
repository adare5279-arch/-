'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportSheet } from '@/lib/exportXlsx';
import type { Department } from '@/lib/types';

export default function DeptPage() {
  const { committee } = useCommittee();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('committee', committee)
        .order('name');
      if (cancelled) return;
      if (error) {
        console.error('Error fetching departments:', error);
        setDepartments([]);
      } else {
        setDepartments((data as Department[]) ?? []);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [committee]);

  function handleExport() {
    exportSheet(`소관부서_${committee}`, '소관부서', departments, [
      { header: '부서명', value: (d) => d.name },
      { header: '홈페이지', value: (d) => d.url ?? '' },
    ]);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#1F4E79]">
          소관부서{committee ? ` — ${committee}` : ''}
        </h1>
        <button
          onClick={handleExport}
          disabled={departments.length === 0}
          className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
        >
          엑셀 저장
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">불러오는 중...</p>
        ) : departments.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">소관부서가 없습니다.</p>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-3">총 {departments.length}개 부서</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((d) => (
                <div
                  key={d.id}
                  className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2 hover:border-[#1F4E79] transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-800">{d.name}</span>
                  {d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#1F4E79] underline hover:opacity-80 truncate"
                    >
                      {d.url}
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">홈페이지 없음</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
