'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportSheet } from '@/lib/exportXlsx';
import { extractText, UPLOAD_ACCEPT } from '@/lib/extractText';
import { ISSUE_TYPES, ISSUE_PROCS } from '@/lib/types';
import type { Issue, Department } from '@/lib/types';

const TYPE_COLOR: Record<string, string> = {
  '위법': '#C62828',
  '부당': '#B45309',
  '개선': '#1565C0',
  '권고': '#2E7D32',
  '주의': '#6A1B9A',
};
const PROC_COLOR: Record<string, string> = {
  '미처리': '#C62828',
  '처리중': '#B45309',
  '처리완료': '#2E7D32',
};

type FormState = {
  date: string;
  dept: string;
  type: string;
  content: string;
  action: string;
  proc: string;
  file_url: string;
  file_name: string;
};

const EMPTY_FORM: FormState = {
  date: '',
  dept: '',
  type: '개선',
  content: '',
  action: '',
  proc: '미처리',
  file_url: '',
  file_name: '',
};

export default function IssuesPage() {
  const { committee } = useCommittee();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMsg, setFileMsg] = useState('');

  const fetchIssues = useCallback(async () => {
    const { data, error } = await supabase
      .from('issues')
      .select('*')
      .eq('committee', committee)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching issues:', error);
      setIssues([]);
    } else {
      setIssues((data as Issue[]) ?? []);
    }
  }, [committee]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const deptRes = await supabase
        .from('departments')
        .select('*')
        .eq('committee', committee)
        .order('name');
      if (cancelled) return;
      setDepartments((deptRes.data as Department[]) ?? []);
      await fetchIssues();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [committee, fetchIssues]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileBusy(true);
    setFileMsg('파일 분석 중...');
    try {
      const { text, supported, ext } = await extractText(file);
      const path = `issues/${crypto.randomUUID()}.${ext || 'bin'}`;
      const { error: upErr } = await supabase.storage
        .from('report-files')
        .upload(path, file, { upsert: true });
      let fileUrl = '';
      if (upErr) {
        console.error('Storage upload error:', upErr);
      } else {
        fileUrl = supabase.storage.from('report-files').getPublicUrl(path).data.publicUrl;
      }
      setForm((f) => ({
        ...f,
        content:
          supported && text ? (f.content ? `${f.content}\n${text}` : text) : f.content,
        file_url: fileUrl,
        file_name: file.name,
      }));
      setFileMsg(
        supported
          ? `본문 추출 완료 (.${ext})`
          : `원본 첨부됨 (.${ext}) — 본문은 직접 입력하세요`
      );
    } catch (err) {
      console.error('File processing error:', err);
      setFileMsg('파일 처리 중 오류가 발생했습니다.');
    } finally {
      setFileBusy(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.content.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('issues').insert({
      committee,
      date: form.date || null,
      dept: form.dept || null,
      type: form.type,
      content: form.content.trim(),
      action: form.action || null,
      proc: form.proc,
      file_url: form.file_url || null,
      file_name: form.file_name || null,
    });
    setSaving(false);
    if (error) {
      console.error('Error inserting issue:', error);
      alert('저장에 실패했습니다.');
      return;
    }
    setForm(EMPTY_FORM);
    setFileMsg('');
    setShowForm(false);
    await fetchIssues();
  }

  async function updateProc(id: number, proc: string) {
    const prev = issues;
    setIssues((rs) => rs.map((r) => (r.id === id ? { ...r, proc } : r)));
    const { error } = await supabase.from('issues').update({ proc }).eq('id', id);
    if (error) {
      console.error('Error updating proc:', error);
      setIssues(prev);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('이 지적사항을 삭제하시겠습니까?')) return;
    const prev = issues;
    setIssues((rs) => rs.filter((r) => r.id !== id));
    const { error } = await supabase.from('issues').delete().eq('id', id);
    if (error) {
      console.error('Error deleting issue:', error);
      setIssues(prev);
    }
  }

  function handleExport() {
    exportSheet(`지적사항_${committee}`, '지적사항', issues, [
      { header: '일자', value: (r) => r.date ?? '' },
      { header: '부서', value: (r) => r.dept ?? '' },
      { header: '유형', value: (r) => r.type },
      { header: '지적내용', value: (r) => r.content },
      { header: '조치요구', value: (r) => r.action ?? '' },
      { header: '처리상태', value: (r) => r.proc },
      { header: '첨부파일', value: (r) => r.file_name ?? '' },
      { header: '첨부링크', value: (r) => r.file_url ?? '' },
    ]);
  }

  const setField = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const inputCls =
    'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#1F4E79]">
          지적사항{committee ? ` — ${committee}` : ''}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={issues.length === 0}
            className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
          >
            엑셀 저장
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
          >
            {showForm ? '닫기' : '+ 지적사항 추가'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            일자
            <input type="date" value={form.date} onChange={setField('date')} className={inputCls} />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            부서
            <select value={form.dept} onChange={setField('dept')} className={inputCls}>
              <option value="">선택 안 함</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            유형
            <select value={form.type} onChange={setField('type')} className={inputCls}>
              {ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            처리상태
            <select value={form.proc} onChange={setField('proc')} className={inputCls}>
              {ISSUE_PROCS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2 rounded-lg border border-dashed border-[#1F4E79]/40 bg-[#1F4E79]/5 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium text-[#1F4E79]">
                파일 첨부 (한글·엑셀·워드·PDF 등)
              </span>
              <input
                type="file"
                accept={UPLOAD_ACCEPT}
                onChange={handleFile}
                disabled={fileBusy}
                className="text-xs file:mr-2 file:rounded file:border-0 file:bg-[#1F4E79] file:px-3 file:py-1.5 file:text-white file:cursor-pointer disabled:opacity-50"
              />
            </div>
            <p className="text-xs text-gray-500">
              txt/csv/docx/pdf/xlsx는 본문이 자동 추출되어 아래 지적내용에 채워집니다.
              한글(.hwp)·.doc 등은 원본 파일이 첨부 링크로 보관됩니다.
            </p>
            {fileMsg && (
              <p className={`text-xs ${fileBusy ? 'text-[#B45309]' : 'text-[#2E7D32]'}`}>
                {fileMsg}
              </p>
            )}
            {form.file_name && (
              <p className="text-xs text-gray-600">
                첨부:{' '}
                {form.file_url ? (
                  <a
                    href={form.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1F4E79] underline"
                  >
                    {form.file_name}
                  </a>
                ) : (
                  form.file_name
                )}
              </p>
            )}
          </div>
          <label className="text-sm text-gray-700 flex flex-col gap-1 sm:col-span-2">
            지적내용
            <textarea value={form.content} onChange={setField('content')} className={inputCls} rows={2} required />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1 sm:col-span-2">
            조치요구
            <textarea value={form.action} onChange={setField('action')} className={inputCls} rows={2} />
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

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">불러오는 중...</p>
        ) : issues.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">등록된 지적사항이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <p className="text-sm text-gray-600 mb-3">총 {issues.length}건</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">일자</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">부서</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">유형</th>
                  <th className="py-2 px-3 font-semibold">지적내용</th>
                  <th className="py-2 px-3 font-semibold">조치요구</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">첨부</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">처리</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody>
                {issues.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                    <td className="py-2 px-3 text-gray-800 whitespace-nowrap">{r.date ?? '—'}</td>
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.dept ?? '—'}</td>
                    <td className="py-2 px-3">
                      <span
                        className="inline-block text-xs font-medium rounded px-2 py-0.5 text-white"
                        style={{ backgroundColor: TYPE_COLOR[r.type] ?? '#555' }}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-800 max-w-xs">{r.content}</td>
                    <td className="py-2 px-3 text-gray-600 max-w-xs">{r.action ?? '—'}</td>
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
                        value={r.proc}
                        onChange={(e) => updateProc(r.id, e.target.value)}
                        className="text-xs font-medium rounded px-2 py-1 text-white border-0 focus:outline-none cursor-pointer"
                        style={{ backgroundColor: PROC_COLOR[r.proc] ?? '#555' }}
                      >
                        {ISSUE_PROCS.map((p) => (
                          <option key={p} value={p} className="bg-white text-gray-900">{p}</option>
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
