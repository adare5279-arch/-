'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { REQUEST_STATUSES } from '@/lib/types';
import { exportSheet } from '@/lib/exportXlsx';
import type { MaterialRequest, Member, Department } from '@/lib/types';

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
};

export default function DocsPage() {
  const { committee } = useCommittee();

  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('전체');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

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
      const [memRes, deptRes] = await Promise.all([
        supabase.from('members').select('*').eq('committee', committee).order('id'),
        supabase.from('departments').select('*').eq('committee', committee).order('name'),
      ]);
      if (cancelled) return;
      setMembers((memRes.data as Member[]) ?? []);
      setDepartments((deptRes.data as Department[]) ?? []);
      await fetchRequests();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [committee, fetchRequests]);

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
    });
    setSaving(false);
    if (error) {
      console.error('Error inserting request:', error);
      alert('저장에 실패했습니다.');
      return;
    }
    setForm(EMPTY_FORM);
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

  const filtered =
    statusFilter === '전체'
      ? requests
      : requests.filter(r => r.status === statusFilter);

  function handleExport() {
    exportSheet(`자료요구_${committee}`, '자료요구', filtered, [
      { header: '의원', value: r => r.member ?? '' },
      { header: '담당부서', value: r => r.dept ?? '' },
      { header: '요구자료명', value: r => r.title },
      { header: '요구일', value: r => r.req_date ?? '' },
      { header: '마감일', value: r => r.due_date ?? '' },
      { header: '상태', value: r => r.status },
      { header: '비고', value: r => r.note ?? '' },
    ]);
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
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
          >
            엑셀 저장
          </button>
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

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">자료요구가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <p className="text-sm text-gray-600 mb-3">총 {filtered.length}건</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">의원</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">담당부서</th>
                  <th className="py-2 px-3 font-semibold">요구자료명</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">마감일</th>
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
