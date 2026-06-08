'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { REQUEST_STATUSES } from '@/lib/types';
import { exportSheet, exportTemplate } from '@/lib/exportXlsx';
import { importExcel, type ImportField } from '@/lib/importXlsx';
import type { MaterialRequest, Member, Department } from '@/lib/types';

const IMPORT_FIELDS: ImportField[] = [
  { key: 'member', aliases: ['의원', 'member'] },
  { key: 'dept_main', aliases: ['주관부서', 'dept_main'] },
  { key: 'dept', aliases: ['담당부서', '부서', 'dept'] },
  { key: 'title', aliases: ['요구자료명', '제목', 'title'], required: true },
  { key: 'req_date', aliases: ['요구일', 'req_date'], type: 'date' },
  { key: 'due_date', aliases: ['마감일', 'due_date'], type: 'date' },
  { key: 'status', aliases: ['상태', 'status'], allowed: REQUEST_STATUSES, fallback: '미제출' },
  { key: 'note', aliases: ['비고', 'note'] },
];

const TEMPLATE_COLUMNS = [
  { header: '의원', value: () => '' },
  { header: '담당부서', value: () => '' },
  { header: '요구자료명', value: () => '' },
  { header: '요구일', value: () => '' },
  { header: '마감일', value: () => '' },
  { header: '상태', value: () => '' },
  { header: '비고', value: () => '' },
];

const STATUS_COLOR: Record<string, string> = {
  '미제출': '#C62828',
  '제출완료': '#2E7D32',
  '부분제출': '#B45309',
  '제출불가': '#6A1B9A',
};

type FormState = {
  member: string;
  dept_main: string;
  dept: string;
  title: string;
  req_date: string;
  due_date: string;
  status: string;
  note: string;
  file_url: string;
  file_name: string;
};

const EMPTY_FORM: FormState = {
  member: '',
  dept_main: '',
  dept: '',
  title: '',
  req_date: '',
  due_date: '',
  status: '미제출',
  note: '',
  file_url: '',
  file_name: '',
};

export default function DocsPage() {
  const { committee } = useCommittee();

  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [issueCounts, setIssueCounts] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('전체');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMsg, setFileMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 검색·필터
  const [q, setQ] = useState('');
  const [deptFilter, setDeptFilter] = useState('전체');
  const [memberFilter, setMemberFilter] = useState('전체');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('material_requests')
      .select('*')
      .eq('committee', committee)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching requests:', error);
      setRequests([]);
    } else {
      setRequests((data as MaterialRequest[]) ?? []);
    }
  }, [committee]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [memRes, deptRes, issRes] = await Promise.all([
        supabase.from('members').select('*').eq('committee', committee).order('id'),
        supabase.from('departments').select('*').eq('committee', committee).order('name'),
        supabase.from('issues').select('request_id').eq('committee', committee),
      ]);
      if (cancelled) return;
      setMembers((memRes.data as Member[]) ?? []);
      setDepartments((deptRes.data as Department[]) ?? []);
      const counts = new Map<number, number>();
      for (const row of (issRes.data as { request_id: number | null }[]) ?? []) {
        if (row.request_id != null) counts.set(row.request_id, (counts.get(row.request_id) ?? 0) + 1);
      }
      setIssueCounts(counts);
      await fetchRequests();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [committee, fetchRequests]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileBusy(true);
    setFileMsg('업로드 중...');
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `requests/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('report-files')
        .upload(path, file, { upsert: true });
      if (upErr) {
        console.error('Storage upload error:', upErr);
        setFileMsg('업로드에 실패했습니다.');
        return;
      }
      const fileUrl = supabase.storage.from('report-files').getPublicUrl(path).data.publicUrl;
      setForm((f) => ({ ...f, file_url: fileUrl, file_name: file.name }));
      setFileMsg(`첨부 완료: ${file.name}`);
    } catch (err) {
      console.error('File upload error:', err);
      setFileMsg('업로드 중 오류가 발생했습니다.');
    } finally {
      setFileBusy(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('material_requests').insert({
      committee,
      member: form.member || null,
      dept_main: form.dept_main || null,
      dept: form.dept || null,
      title: form.title.trim(),
      req_date: form.req_date || null,
      due_date: form.due_date || null,
      status: form.status,
      note: form.note || null,
      file_url: form.file_url || null,
      file_name: form.file_name || null,
    });
    setSaving(false);
    if (error) {
      console.error('Error inserting request:', error);
      alert('저장에 실패했습니다.');
      return;
    }
    setForm(EMPTY_FORM);
    setFileMsg('');
    setShowForm(false);
    await fetchRequests();
  }

  async function updateStatus(id: number, status: string) {
    const prev = requests;
    setRequests(rs => rs.map(r => (r.id === id ? { ...r, status } : r)));
    const { error } = await supabase
      .from('material_requests')
      .update({ status })
      .eq('id', id);
    if (error) {
      console.error('Error updating status:', error);
      setRequests(prev);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('이 자료요구를 삭제하시겠습니까?')) return;
    const prev = requests;
    setRequests(rs => rs.filter(r => r.id !== id));
    const { error } = await supabase.from('material_requests').delete().eq('id', id);
    if (error) {
      console.error('Error deleting request:', error);
      setRequests(prev);
    }
  }

  const filtered = requests.filter(r => {
    if (statusFilter !== '전체' && r.status !== statusFilter) return false;
    if (deptFilter !== '전체' && r.dept !== deptFilter) return false;
    if (memberFilter !== '전체' && r.member !== memberFilter) return false;
    if (fromDate && (!r.req_date || r.req_date < fromDate)) return false;
    if (toDate && (!r.req_date || r.req_date > toDate)) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const hay = `${r.title} ${r.note ?? ''} ${r.dept ?? ''} ${r.member ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const filterActive =
    q.trim() !== '' ||
    deptFilter !== '전체' ||
    memberFilter !== '전체' ||
    fromDate !== '' ||
    toDate !== '';

  function resetFilters() {
    setQ('');
    setDeptFilter('전체');
    setMemberFilter('전체');
    setFromDate('');
    setToDate('');
  }

  function handleExport() {
    exportSheet(`자료요구_${committee}`, '자료요구', filtered, [
      { header: '의원', value: r => r.member ?? '' },
      { header: '담당부서', value: r => r.dept ?? '' },
      { header: '요구자료명', value: r => r.title },
      { header: '요구일', value: r => r.req_date ?? '' },
      { header: '마감일', value: r => r.due_date ?? '' },
      { header: '상태', value: r => r.status },
      { header: '비고', value: r => r.note ?? '' },
      { header: '첨부파일', value: r => r.file_name ?? '' },
      { header: '첨부링크', value: r => r.file_url ?? '' },
    ]);
  }

  function handleTemplate() {
    exportTemplate(`자료요구_양식`, '자료요구', TEMPLATE_COLUMNS);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    setImporting(true);
    try {
      await importExcel({
        file,
        label: '자료요구',
        base: { committee },
        fields: IMPORT_FIELDS,
        insert: async (records) => supabase.from('material_requests').insert(records),
        onDone: fetchRequests,
      });
    } finally {
      setImporting(false);
    }
  }

  const setField = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [k]: e.target.value }));

  const inputCls =
    'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#1F4E79]">
          자료요구{committee ? ` — ${committee}` : ''}
        </h1>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={handleTemplate}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            양식 다운로드
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-lg border border-[#1F4E79] bg-white px-4 py-2 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors disabled:opacity-40"
          >
            {importing ? '가져오는 중...' : '엑셀 불러오기'}
          </button>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
          >
            엑셀 저장
          </button>
          <Link
            href="/docs/print"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            자료요구서 출력
          </Link>
          <button
            onClick={() => setShowForm(s => !s)}
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
          >
            {showForm ? '닫기' : '+ 자료요구 추가'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            의원
            <select value={form.member} onChange={setField('member')} className={inputCls}>
              <option value="">선택 안 함</option>
              {members.map(m => (
                <option key={m.id} value={m.name}>{m.name} ({m.role})</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            담당부서
            <select value={form.dept} onChange={setField('dept')} className={inputCls}>
              <option value="">선택 안 함</option>
              {departments.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1 sm:col-span-2">
            요구자료명
            <input
              value={form.title}
              onChange={setField('title')}
              className={inputCls}
              placeholder="요구자료명을 입력하세요"
              required
            />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            요구일
            <input type="date" value={form.req_date} onChange={setField('req_date')} className={inputCls} />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            마감일
            <input type="date" value={form.due_date} onChange={setField('due_date')} className={inputCls} />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            상태
            <select value={form.status} onChange={setField('status')} className={inputCls}>
              {REQUEST_STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1 sm:col-span-2">
            비고
            <textarea value={form.note} onChange={setField('note')} className={inputCls} rows={2} />
          </label>
          <div className="sm:col-span-2 rounded-lg border border-dashed border-[#1F4E79]/40 bg-[#1F4E79]/5 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium text-[#1F4E79]">제출자료 첨부 (선택)</span>
              <input
                type="file"
                onChange={handleFile}
                disabled={fileBusy}
                className="text-xs file:mr-2 file:rounded file:border-0 file:bg-[#1F4E79] file:px-3 file:py-1.5 file:text-white file:cursor-pointer disabled:opacity-50"
              />
            </div>
            <p className="text-xs text-gray-500">
              부서가 제출한 자료 파일을 첨부해 두면 자료요구 건과 함께 보관됩니다.
            </p>
            {fileMsg && (
              <p className={`text-xs ${fileBusy ? 'text-[#B45309]' : 'text-[#2E7D32]'}`}>{fileMsg}</p>
            )}
            {form.file_name && !fileBusy && (
              <p className="text-xs text-gray-600">
                첨부:{' '}
                {form.file_url ? (
                  <a href={form.file_url} target="_blank" rel="noopener noreferrer" className="text-[#1F4E79] underline">
                    {form.file_name}
                  </a>
                ) : (
                  form.file_name
                )}
              </p>
            )}
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-2 flex-wrap">
        {['전체', ...REQUEST_STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm rounded border transition-colors ${
              statusFilter === s
                ? 'bg-[#1F4E79] text-white border-[#1F4E79]'
                : 'bg-white text-[#1F4E79] border-gray-300 hover:border-[#1F4E79]'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-600 flex flex-col gap-1 grow min-w-[160px]">
          검색
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="요구자료명·비고·부서·의원"
            className={inputCls}
          />
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          의원
          <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)} className={inputCls}>
            <option value="전체">전체</option>
            {members.map(m => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          담당부서
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className={inputCls}>
            <option value="전체">전체</option>
            {departments.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          요구일(시작)
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          요구일(종료)
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={inputCls} />
        </label>
        {filterActive && (
          <button
            onClick={resetFilters}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            초기화
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">자료요구가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <p className="text-sm text-gray-600 mb-3">
              총 {filtered.length}건
              {filterActive || statusFilter !== '전체' ? ` (전체 ${requests.length}건)` : ''}
            </p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">의원</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">담당부서</th>
                  <th className="py-2 px-3 font-semibold">요구자료명</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">마감일</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">연계 지적</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">첨부</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">상태</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-800 whitespace-nowrap">{r.member ?? '—'}</td>
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.dept ?? '—'}</td>
                    <td className="py-2 px-3 text-gray-800">{r.title}</td>
                    <td className="py-2 px-3 text-gray-800 whitespace-nowrap">{r.due_date ?? '—'}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {issueCounts.get(r.id) ? (
                        <Link
                          href="/issues"
                          className="inline-block text-xs rounded bg-[#C62828]/10 text-[#C62828] px-2 py-0.5 hover:underline"
                        >
                          지적 {issueCounts.get(r.id)}건
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {r.file_url ? (
                        <a
                          href={r.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1F4E79] underline hover:opacity-80"
                          title={r.file_name ?? ''}
                        >
                          파일
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={r.status}
                        onChange={e => updateStatus(r.id, e.target.value)}
                        className="text-xs font-medium rounded px-2 py-1 text-white border-0 focus:outline-none cursor-pointer"
                        style={{ backgroundColor: STATUS_COLOR[r.status] ?? '#555' }}
                      >
                        {REQUEST_STATUSES.map(s => (
                          <option key={s} value={s} className="bg-white text-gray-900">{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-xs text-[#C62828] hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
