'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportSheet, exportTemplate } from '@/lib/exportXlsx';
import { importExcel, type ImportField } from '@/lib/importXlsx';
import type { Member } from '@/lib/types';

const IMPORT_FIELDS: ImportField[] = [
  { key: 'name', aliases: ['이름', '성명', 'name'], required: true },
  { key: 'role', aliases: ['직위', 'role'], fallback: '위원' },
  { key: 'party', aliases: ['정당', 'party'] },
  { key: 'district', aliases: ['선거구', 'district'] },
];

const TEMPLATE_COLUMNS = [
  { header: '이름', value: () => '' },
  { header: '직위', value: () => '' },
  { header: '정당', value: () => '' },
  { header: '선거구', value: () => '' },
];

const ROLE_RANK: Record<string, number> = {
  위원장: 0,
  부위원장: 1,
  위원: 2,
};

function roleRank(role: string): number {
  return ROLE_RANK[role] ?? 99;
}

const PARTY_COLOR: Record<string, string> = {
  민주: '#1565C0',
  '국민의힘': '#C62828',
};

function partyColor(party: string | null): string {
  if (!party) return '#555';
  return PARTY_COLOR[party] ?? '#555';
}

function PartyBadge({ party }: { party: string | null }) {
  return (
    <span
      className="inline-block text-xs font-medium rounded px-2 py-0.5 text-white"
      style={{ backgroundColor: partyColor(party) }}
    >
      {party ?? '무소속'}
    </span>
  );
}

function MemberCard({ m }: { m: Member }) {
  const [showImg, setShowImg] = useState(!!m.photo_url);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex flex-col items-center gap-2 text-center">
      {showImg && m.photo_url ? (
        <img
          src={m.photo_url}
          alt={m.name}
          className="w-16 h-16 rounded-full object-cover border border-gray-200"
          onError={() => setShowImg(false)}
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-2xl border border-gray-200">
          {m.name.charAt(0)}
        </div>
      )}
      <div>
        <p className="font-bold text-gray-900">{m.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{m.role}</p>
      </div>
      <PartyBadge party={m.party} />
      {m.district && (
        <p className="text-xs text-gray-400">{m.district}</p>
      )}
    </div>
  );
}

function MemberRow({ m }: { m: Member }) {
  const [showImg, setShowImg] = useState(!!m.photo_url);

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50">
      <td className="py-2 pr-4">
        {showImg && m.photo_url ? (
          <img
            src={m.photo_url}
            alt={m.name}
            className="w-10 h-10 rounded-full object-cover border border-gray-200"
            onError={() => setShowImg(false)}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200 text-sm">
            {m.name.charAt(0)}
          </div>
        )}
      </td>
      <td className="py-2 pr-4 font-medium text-gray-900">{m.name}</td>
      <td className="py-2 pr-4 text-gray-600">{m.role}</td>
      <td className="py-2 pr-4">
        <PartyBadge party={m.party} />
      </td>
      <td className="py-2 text-gray-500 text-sm">{m.district ?? '—'}</td>
    </tr>
  );
}

export default function MembersPage() {
  const { committee } = useCommittee();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('committee', committee);
    const sorted = ((data as Member[]) ?? []).sort(
      (a, b) => roleRank(a.role) - roleRank(b.role)
    );
    setMembers(sorted);
  }, [committee]);

  useEffect(() => {
    if (!committee) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await fetchMembers();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [committee, fetchMembers]);

  const totalCount = members.length;
  const minjuCount = members.filter(m => m.party === '민주').length;
  const pppCount = members.filter(m => m.party === '국민의힘').length;
  const etcCount = members.filter(
    m => m.party !== '민주' && m.party !== '국민의힘'
  ).length;

  function handleExport() {
    exportSheet(`의원명부_${committee}`, '의원명부', members, [
      { header: '이름', value: m => m.name },
      { header: '직위', value: m => m.role },
      { header: '정당', value: m => m.party ?? '무소속' },
      { header: '선거구', value: m => m.district ?? '' },
    ]);
  }

  function handleTemplate() {
    exportTemplate(`의원명부_양식`, '의원명부', TEMPLATE_COLUMNS);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      await importExcel({
        file,
        label: '의원',
        base: { committee },
        fields: IMPORT_FIELDS,
        insert: async (records) => supabase.from('members').insert(records),
        onDone: fetchMembers,
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#1F4E79]">의원명부</h1>
          {committee && (
            <span className="text-base font-medium text-gray-600">— {committee}</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleImportFile}
          className="hidden"
        />
        <button
          onClick={handleTemplate}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          양식 다운로드
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="rounded-lg border border-[#1F4E79] bg-white px-3 py-1.5 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors disabled:opacity-40"
        >
          {importing ? '가져오는 중...' : '엑셀 불러오기'}
        </button>
        <button
          onClick={handleExport}
          disabled={members.length === 0}
          className="rounded-lg border border-[#2E7D32] bg-white px-3 py-1.5 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
        >
          엑셀 저장
        </button>
        {/* View toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            onClick={() => setViewMode('card')}
            className={`px-3 py-1.5 transition-colors ${
              viewMode === 'card'
                ? 'bg-[#1F4E79] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            카드 보기
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${
              viewMode === 'table'
                ? 'bg-[#1F4E79] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            표 보기
          </button>
        </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          불러오는 중...
        </div>
      ) : (
        <>
          {/* Summary */}
          <p className="text-sm text-gray-600">
            총 <strong className="text-[#1F4E79]">{totalCount}명</strong>
            {' '}|{' '}
            <span style={{ color: '#1565C0' }}>민주 {minjuCount}명</span>
            {' '}|{' '}
            <span style={{ color: '#C62828' }}>국민의힘 {pppCount}명</span>
            {' '}|{' '}
            <span style={{ color: '#555' }}>기타 {etcCount}명</span>
          </p>

          {members.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">
              위원회 의원 정보가 없습니다.
            </p>
          ) : viewMode === 'card' ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {members.map(m => (
                <MemberCard key={m.id} m={m} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-left">
                    <th className="py-2 pr-4 font-medium">사진</th>
                    <th className="py-2 pr-4 font-medium">이름</th>
                    <th className="py-2 pr-4 font-medium">직위</th>
                    <th className="py-2 pr-4 font-medium">정당</th>
                    <th className="py-2 font-medium">선거구</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <MemberRow key={m.id} m={m} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
