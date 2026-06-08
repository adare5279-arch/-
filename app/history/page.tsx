'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import type { ActivityLog } from '@/lib/types';

const TABLE_LABEL: Record<string, string> = {
  material_requests: '자료요구',
  issues: '지적사항',
  witnesses: '증인·참고인',
  schedule_events: '감사 일정',
  members: '의원명부',
  departments: '소관부서',
};

const OP_LABEL: Record<string, { text: string; color: string }> = {
  INSERT: { text: '등록', color: '#2E7D32' },
  UPDATE: { text: '수정', color: '#B45309' },
  DELETE: { text: '삭제', color: '#C62828' },
};

const BACKUP_TABLES = [
  'material_requests',
  'issues',
  'witnesses',
  'schedule_events',
  'members',
  'departments',
  'meetings',
  'report_sections',
] as const;

function fmt(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

export default function HistoryPage() {
  const { committee } = useCommittee();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeAll, setScopeAll] = useState(false);
  const [backing, setBacking] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let qb = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!scopeAll) qb = qb.eq('committee', committee);
    const { data } = await qb;
    setLogs((data as ActivityLog[]) ?? []);
    setLoading(false);
  }, [committee, scopeAll]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  async function handleBackup(allCommittees: boolean) {
    setBacking(true);
    try {
      const dump: Record<string, unknown[]> = {};
      for (const t of BACKUP_TABLES) {
        let qb = supabase.from(t).select('*');
        // meetings/report_sections 등 committee 컬럼 보유 → 범위 적용
        if (!allCommittees) qb = qb.eq('committee', committee);
        const { data, error } = await qb;
        if (error) {
          console.error(`Backup error on ${t}:`, error);
          dump[t] = [];
        } else {
          dump[t] = data ?? [];
        }
      }
      const payload = {
        exported_at: new Date().toISOString(),
        scope: allCommittees ? '전체 위원회' : committee,
        tables: dump,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      const tag = allCommittees ? '전체' : committee;
      a.href = url;
      a.download = `행정사무감사_백업_${tag}_${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Backup failed:', e);
      alert('백업에 실패했습니다.');
    } finally {
      setBacking(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-[#1F4E79]">변경 이력 · 데이터 백업</h1>

      {/* 백업 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
        <h2 className="text-base font-semibold text-[#1F4E79]">데이터 백업 (JSON)</h2>
        <p className="text-sm text-gray-500">
          전체 데이터를 JSON 파일로 내려받아 보관합니다. 자료요구·지적사항·증인·일정·의원·부서·회의록·보고서를 모두 포함합니다.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleBackup(false)}
            disabled={backing}
            className="rounded-lg border border-[#1F4E79] bg-white px-4 py-2 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors disabled:opacity-40"
          >
            {backing ? '백업 중...' : `현재 위원회 백업 (${committee})`}
          </button>
          <button
            onClick={() => handleBackup(true)}
            disabled={backing}
            className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
          >
            {backing ? '백업 중...' : '전체 위원회 백업'}
          </button>
        </div>
      </div>

      {/* 변경 이력 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-[#1F4E79]">최근 변경 이력</h2>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={!scopeAll} onChange={() => setScopeAll(false)} />
              현재 위원회
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={scopeAll} onChange={() => setScopeAll(true)} />
              전체
            </label>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 py-6 text-center">불러오는 중...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">변경 이력이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">일시</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">구분</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">작업</th>
                  {scopeAll && <th className="py-2 px-3 font-semibold whitespace-nowrap">위원회</th>}
                  <th className="py-2 px-3 font-semibold">내용</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const op = OP_LABEL[l.op] ?? { text: l.op, color: '#555' };
                  return (
                    <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{fmt(l.created_at)}</td>
                      <td className="py-2 px-3 text-gray-700 whitespace-nowrap">
                        {TABLE_LABEL[l.table_name] ?? l.table_name}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className="inline-block text-xs font-medium rounded px-2 py-0.5 text-white"
                          style={{ backgroundColor: op.color }}
                        >
                          {op.text}
                        </span>
                      </td>
                      {scopeAll && (
                        <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{l.committee ?? '—'}</td>
                      )}
                      <td className="py-2 px-3 text-gray-800 max-w-md truncate" title={l.summary ?? ''}>
                        {l.summary || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 pt-2">최근 200건까지 표시됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
