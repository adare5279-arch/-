'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportSheet } from '@/lib/exportXlsx';
import { extractText, UPLOAD_ACCEPT } from '@/lib/extractText';
import { WITNESS_KINDS, WITNESS_ATTENDS } from '@/lib/types';
import type { Witness } from '@/lib/types';

const ATTEND_COLOR: Record<string, string> = {
  '출석예정': '#B45309',
  '출석완료': '#2E7D32',
  '불출석': '#C62828',
};

type FormState = {
  kind: string;
  name: string;
  org: string;
  pos: string;
  dt: string;
  attend: string;
  phone: string;
  note: string;
  file_url: string;
  file_name: string;
};

const EMPTY_FORM: FormState = {
  kind: '증인',
  name: '',
  org: '',
  pos: '',
  dt: '',
  attend: '출석예정',
  phone: '',
  note: '',
  file_url: '',
  file_name: '',
};

export default function WitnessesPage() {
  const { committee } = useCommittee();
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMsg, setFileMsg] = useState('');

  const fetchWitnesses = useCallback(async () => {
    const { data, error } = await supabase
      .from('witnesses')
      .select('*')
      .eq('committee', committee)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching witnesses:', error);
      setWitnesses([]);
    } else {
      setWitnesses((data as Witness[]) ?? []);
    }
  }, [committee]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchWitnesses();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchWitnesses]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileBusy(true);
    setFileMsg('파일 분석 중...');
    try {
      const { text, supported, ext } = await extractText(file);
      const path = `witnesses/${crypto.randomUUID()}.${ext || 'bin'}`;
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
        note:
          supported && text ? (f.note ? `${f.note}\n${text}` : text) : f.note,
        file_url: fileUrl,
        file_name: file.name,
      }));
      setFileMsg(
        supported
          ? `본문 추출 완료 (.${ext})`
          : `원본 첨부됨 (.${ext}) — 내용은 직접 입력하세요`
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
    if (!form.name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('witnesses').insert({
      committee,
      kind: form.kind,
      name: form.name.trim(),
      org: form.org || null,
      pos: form.pos || null,
      dt: form.dt || null,
      attend: form.attend,
      phone: form.phone || null,
      note: form.note || null,
      file_url: form.file_url || null,
      file_name: form.file_name || null,
    });
    setSaving(false);
    if (error) {
      console.error('Error inserting witness:', error);
      alert('저장에 실패했습니다.');
      return;
    }
    setForm(EMPTY_FORM);
    setFileMsg('');
    setShowForm(false);
    await fetchWitnesses();
  }

  async function updateAttend(id: number, attend: string) {
    const prev = witnesses;
    setWitnesses((rs) => rs.map((r) => (r.id === id ? { ...r, attend } : r)));
    const { error } = await supabase.from('witnesses').update({ attend }).eq('id', id);
    if (error) {
      console.error('Error updating attend:', error);
      setWitnesses(prev);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('이 증인·참고인을 삭제하시겠습니까?')) return;
    const prev = witnesses;
    setWitnesses((rs) => rs.filter((r) => r.id !== id));
    const { error } = await supabase.from('witnesses').delete().eq('id', id);
    if (error) {
      console.error('Error deleting witness:', error);
      setWitnesses(prev);
    }
  }

  function handleExport() {
    exportSheet(`증인참고인_${committee}`, '증인참고인', witnesses, [
      { header: '구분', value: (r) => r.kind },
      { header: '성명', value: (r) => r.name },
      { header: '소속', value: (r) => r.org ?? '' },
      { header: '직위', value: (r) => r.pos ?? '' },
      { header: '일시', value: (r) => r.dt ?? '' },
      { header: '출석', value: (r) => r.attend },
      { header: '연락처', value: (r) => r.phone ?? '' },
      { header: '비고', value: (r) => r.note ?? '' },
      { header: '첨부파일', value: (r) => r.file_name ?? '' },
      { header: '첨부링크', value: (r) => r.file_url ?? '' },
    ]);
  }

  const setField = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const inputCls =
    'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  const attendCount = witnesses.filter((w) => w.attend === '출석완료').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#1F4E79]">
          증인·참고인{committee ? ` — ${committee}` : ''}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={witnesses.length === 0}
            className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
          >
            엑셀 저장
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
          >
            {showForm ? '닫기' : '+ 증인·참고인 추가'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            구분
            <select value={form.kind} onChange={setField('kind')} className={inputCls}>
              {WITNESS_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            성명
            <input value={form.name} onChange={setField('name')} className={inputCls} required />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            소속
            <input value={form.org} onChange={setField('org')} className={inputCls} />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            직위
            <input value={form.pos} onChange={setField('pos')} className={inputCls} />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            출석일시
            <input
              value={form.dt}
              onChange={setField('dt')}
              className={inputCls}
              placeholder="2026-11-11 10:00"
            />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            출석여부
            <select value={form.attend} onChange={setField('attend')} className={inputCls}>
              {WITNESS_ATTENDS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            연락처
            <input value={form.phone} onChange={setField('phone')} className={inputCls} />
          </label>
          <div className="sm:col-span-2 rounded-lg border border-dashed border-[#1F4E79]/40 bg-[#1F4E79]/5 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium text-[#1F4E79]">
                파일 첨부 (출석요구서·진술서 등 / 한글·엑셀·워드·PDF)
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
              txt/csv/docx/pdf/xlsx/hwp는 본문이 자동 추출되어 아래 비고에 채워집니다.
              .hwpx·.doc 등은 원본 파일이 첨부 링크로 보관됩니다.
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

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">불러오는 중...</p>
        ) : witnesses.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">등록된 증인·참고인이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <p className="text-sm text-gray-600 mb-3">
              총 {witnesses.length}명 · 출석완료 {attendCount}명
            </p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">구분</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">성명</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">소속</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">직위</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">일시</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">출석</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">연락처</th>
                  <th className="py-2 px-3 font-semibold">비고</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">첨부</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody>
                {witnesses.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-800 whitespace-nowrap">{r.kind}</td>
                    <td className="py-2 px-3 text-gray-800 whitespace-nowrap font-medium">{r.name}</td>
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.org ?? '—'}</td>
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.pos ?? '—'}</td>
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.dt ?? '—'}</td>
                    <td className="py-2 px-3">
                      <select
                        value={r.attend}
                        onChange={(e) => updateAttend(r.id, e.target.value)}
                        className="text-xs font-medium rounded px-2 py-1 text-white border-0 focus:outline-none cursor-pointer"
                        style={{ backgroundColor: ATTEND_COLOR[r.attend] ?? '#555' }}
                      >
                        {WITNESS_ATTENDS.map((a) => (
                          <option key={a} value={a} className="bg-white text-gray-900">{a}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.phone ?? '—'}</td>
                    <td className="py-2 px-3 text-gray-600">{r.note ?? '—'}</td>
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
