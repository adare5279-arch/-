'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { insertRows, deleteRows } from '@/lib/dataApi';
import { useCommittee } from '@/lib/CommitteeContext';
import { BUDGET_FIELDS } from '@/lib/types';
import { exportSheet, exportTemplate } from '@/lib/exportXlsx';
import { extractBudgetDrafts, type BudgetDraft } from '@/lib/importDoc';
import BudgetImportPreview from '@/components/BudgetImportPreview';
import type { BudgetItem, Department } from '@/lib/types';
import { useFocusRow } from '@/lib/useFocusRow';

const FOLDER_EXTS = ['xlsx', 'xls', 'csv', 'pdf', 'hwp', 'docx', 'txt'];

const IMPORT_ACCEPT = '.xlsx,.xls,.csv,.pdf,.hwp,.docx,.txt';

const TEMPLATE_COLUMNS = [
  { header: '회계연도', value: () => '' },
  { header: '분야', value: () => '' },
  { header: '소관부서', value: () => '' },
  { header: '사업명', value: () => '' },
  { header: '예산현액', value: () => '' },
  { header: '비고', value: () => '' },
];

const won = (n: number) => n.toLocaleString('ko-KR');

type FormState = {
  year: string;
  field: string;
  dept: string;
  program: string;
  budget: string;
  note: string;
};

const thisYear = new Date().getFullYear();

const EMPTY_FORM: FormState = {
  year: String(thisYear),
  field: '정책사업',
  dept: '',
  program: '',
  budget: '',
  note: '',
};

export default function BudgetPage() {
  const { committee } = useCommittee();

  const [items, setItems] = useState<BudgetItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // 자료(엑셀/한글/PDF)·폴더 가져오기 미리보기
  const [parsing, setParsing] = useState(false);
  const [savingPreview, setSavingPreview] = useState(false);
  const [preview, setPreview] = useState<{
    drafts: BudgetDraft[];
    rawText: string;
    source: string;
    warnings: string[];
  } | null>(null);
  // 필터
  const [yearFilter, setYearFilter] = useState<string>('전체');
  const [fieldFilter, setFieldFilter] = useState<string>('전체');
  const [deptFilter, setDeptFilter] = useState<string>('전체');
  const [q, setQ] = useState('');
  const focusId = useFocusRow(!loading);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('budget_items')
      .select('*')
      .eq('committee', committee)
      .order('year', { ascending: false })
      .order('dept')
      .order('id');
    if (error) {
      console.error('Error fetching budget_items:', error);
      setItems([]);
    } else {
      setItems((data as BudgetItem[]) ?? []);
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
      await fetchItems();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [committee, fetchItems]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.program.trim()) return;
    setSaving(true);
    const { error } = await insertRows('budget_items', {
      committee,
      year: Number(form.year) || thisYear,
      field: form.field || null,
      dept: form.dept || null,
      program: form.program.trim(),
      budget: Number(form.budget) || 0,
      executed: 0,
      carryover: 0,
      note: form.note || null,
    });
    setSaving(false);
    if (error) {
      console.error('Error inserting budget item:', error);
      alert('저장에 실패했습니다.');
      return;
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    await fetchItems();
  }

  async function handleDelete(id: number) {
    if (!confirm('이 예산 사업을 삭제하시겠습니까? (결산 자료도 함께 삭제됩니다)')) return;
    const prev = items;
    setItems((rs) => rs.filter((r) => r.id !== id));
    const { error } = await deleteRows('budget_items', { id });
    if (error) {
      console.error('Error deleting budget item:', error);
      setItems(prev);
    }
  }

  const years = Array.from(new Set(items.map((r) => r.year))).sort((a, b) => b - a);

  const filtered = items.filter((r) => {
    if (yearFilter !== '전체' && String(r.year) !== yearFilter) return false;
    if (fieldFilter !== '전체' && r.field !== fieldFilter) return false;
    if (deptFilter !== '전체' && r.dept !== deptFilter) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const hay = `${r.program} ${r.dept ?? ''} ${r.field ?? ''} ${r.note ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const totalBudget = filtered.reduce((s, r) => s + r.budget, 0);

  const filterActive =
    q.trim() !== '' || yearFilter !== '전체' || fieldFilter !== '전체' || deptFilter !== '전체';

  function resetFilters() {
    setQ('');
    setYearFilter('전체');
    setFieldFilter('전체');
    setDeptFilter('전체');
  }

  function handleExport() {
    exportSheet(`예산자료_${committee}`, '예산자료', filtered, [
      { header: '회계연도', value: (r) => r.year },
      { header: '분야', value: (r) => r.field ?? '' },
      { header: '소관부서', value: (r) => r.dept ?? '' },
      { header: '사업명', value: (r) => r.program },
      { header: '예산현액(천원)', value: (r) => r.budget },
      { header: '비고', value: (r) => r.note ?? '' },
    ]);
  }

  function handleTemplate() {
    exportTemplate('예산자료_양식', '예산자료', TEMPLATE_COLUMNS);
  }

  async function handleDocFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const kindLabel =
      ext === 'pdf'
        ? 'PDF'
        : ext === 'hwp'
          ? '한글'
          : ext === 'xlsx' || ext === 'xls'
            ? '엑셀'
            : ext === 'csv'
              ? 'CSV'
              : ext === 'docx'
                ? 'Word'
                : '자료';
    setParsing(true);
    try {
      const { drafts, rawText, supported } = await extractBudgetDrafts(file, {
        year: String(thisYear),
      });
      if (!supported) {
        alert(
          `${file.name} 의 텍스트를 추출하지 못했습니다.\n` +
            '지원: HWP 5.0(한글2007 이상), 텍스트형 PDF. (스캔 이미지·HWPX·구버전 HWP는 미지원)'
        );
        return;
      }
      setPreview({ drafts, rawText, source: `${kindLabel}: ${file.name}`, warnings: [] });
    } catch (err) {
      console.error('Error parsing document:', err);
      alert('파일을 읽지 못했습니다.');
    } finally {
      setParsing(false);
    }
  }

  async function handleFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const targets = files.filter((f) =>
      FOLDER_EXTS.includes((f.name.split('.').pop() || '').toLowerCase())
    );
    if (targets.length === 0) {
      alert('폴더에 가져올 수 있는 파일(xlsx/csv/pdf/hwp/docx)이 없습니다.');
      return;
    }
    setParsing(true);
    const allDrafts: BudgetDraft[] = [];
    const warnings: string[] = [];
    try {
      for (const f of targets) {
        try {
          const { drafts, supported } = await extractBudgetDrafts(f, {
            year: String(thisYear),
          });
          if (!supported) {
            warnings.push(`${f.name}: 텍스트 추출 불가 — 건너뜀`);
            continue;
          }
          if (drafts.length === 0) {
            warnings.push(`${f.name}: 예산 행을 인식하지 못함`);
            continue;
          }
          allDrafts.push(...drafts);
        } catch (err) {
          console.error('Error parsing', f.name, err);
          warnings.push(`${f.name}: 읽기 실패 — 건너뜀`);
        }
      }
      setPreview({
        drafts: allDrafts,
        rawText: '',
        source: `폴더 가져오기 · 파일 ${targets.length}개 → 인식 ${allDrafts.length}행`,
        warnings,
      });
    } finally {
      setParsing(false);
    }
  }

  async function confirmPreview(rows: BudgetDraft[]) {
    setSavingPreview(true);
    const records = rows.map((d) => ({
      committee,
      year: Number(d.year) || thisYear,
      field: d.field || null,
      dept: d.dept || null,
      program: d.program.trim(),
      budget: Number(d.budget) || 0,
      executed: 0,
      carryover: 0,
      note: d.note || null,
    }));
    const { error } = await insertRows('budget_items', records);
    setSavingPreview(false);
    if (error) {
      console.error('Error importing budget drafts:', error);
      alert('등록에 실패했습니다.');
      return;
    }
    setPreview(null);
    await fetchItems();
    alert(`예산자료 ${records.length}건을 등록했습니다.`);
  }

  const setField =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const inputCls =
    'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  return (
    <div className="p-6 space-y-6">
      {preview && (
        <BudgetImportPreview
          initial={preview.drafts}
          rawText={preview.rawText}
          departments={departments}
          source={preview.source}
          warnings={preview.warnings}
          saving={savingPreview}
          onCancel={() => setPreview(null)}
          onConfirm={confirmPreview}
        />
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#1F4E79]">
            예산 자료{committee ? ` — ${committee}` : ''}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            소관부서 세출예산 현액을 사업별로 등록합니다. (단위: 천원) 집행 결과는{' '}
            <Link href="/settlement" className="text-[#1F4E79] underline">
              결산자료
            </Link>
            에서 입력합니다.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept={IMPORT_ACCEPT}
            onChange={handleDocFile}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // 비표준 폴더 선택 속성 (Chromium/Edge/Safari 지원)
            // @ts-expect-error directory attributes are non-standard
            webkitdirectory=""
            directory=""
            onChange={handleFolder}
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
            disabled={parsing}
            title="엑셀·CSV·한글(HWP)·PDF·Word 파일을 불러옵니다"
            className="rounded-lg border border-[#1F4E79] bg-white px-4 py-2 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors disabled:opacity-40"
          >
            {parsing ? '읽는 중...' : '자료 불러오기'}
          </button>
          <button
            onClick={() => folderInputRef.current?.click()}
            disabled={parsing}
            className="rounded-lg border border-[#6A1B9A] bg-white px-4 py-2 text-sm font-medium text-[#6A1B9A] hover:bg-[#6A1B9A] hover:text-white transition-colors disabled:opacity-40"
          >
            {parsing ? '읽는 중...' : '폴더 가져오기'}
          </button>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
          >
            엑셀 저장
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
          >
            {showForm ? '닫기' : '+ 예산 추가'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            회계연도
            <input type="number" value={form.year} onChange={setField('year')} className={inputCls} />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            분야(성질별)
            <select value={form.field} onChange={setField('field')} className={inputCls}>
              {BUDGET_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            소관부서
            <select value={form.dept} onChange={setField('dept')} className={inputCls}>
              <option value="">선택 안 함</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            예산현액 (천원)
            <input
              type="number"
              value={form.budget}
              onChange={setField('budget')}
              className={inputCls}
              placeholder="예: 1200000"
            />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1 sm:col-span-2">
            사업명
            <input
              value={form.program}
              onChange={setField('program')}
              className={inputCls}
              placeholder="세부사업명을 입력하세요"
              required
            />
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

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-600 flex flex-col gap-1 grow min-w-[160px]">
          검색
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="사업명·부서·분야·비고"
            className={inputCls}
          />
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          회계연도
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className={inputCls}>
            <option value="전체">전체</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          분야
          <select value={fieldFilter} onChange={(e) => setFieldFilter(e.target.value)} className={inputCls}>
            <option value="전체">전체</option>
            {BUDGET_FIELDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          소관부서
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={inputCls}>
            <option value="전체">전체</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
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
          <p className="text-sm text-gray-500 py-6 text-center">등록된 예산 자료가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="text-sm text-gray-600">
                총 {filtered.length}개 사업
                {filterActive ? ` (전체 ${items.length}개)` : ''}
              </p>
              <p className="text-sm font-semibold text-[#1F4E79]">
                예산현액 합계: {won(totalBudget)} 천원
              </p>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">연도</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">분야</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">소관부서</th>
                  <th className="py-2 px-3 font-semibold">사업명</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap text-right">예산현액(천원)</th>
                  <th className="py-2 px-3 font-semibold">비고</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    id={`row-${r.id}`}
                    className={`border-b border-gray-100 transition-colors ${
                      focusId === r.id ? 'bg-amber-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.year}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className="inline-block text-xs rounded bg-gray-100 text-gray-700 px-2 py-0.5">
                        {r.field ?? '—'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.dept ?? '—'}</td>
                    <td className="py-2 px-3 text-gray-800">{r.program}</td>
                    <td className="py-2 px-3 text-right font-medium text-gray-900 whitespace-nowrap">
                      {won(r.budget)}
                    </td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{r.note ?? ''}</td>
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
              <tfoot>
                <tr className="border-t-2 border-gray-300 font-semibold text-gray-800">
                  <td className="py-2 px-3" colSpan={4}>
                    합계
                  </td>
                  <td className="py-2 px-3 text-right text-[#1F4E79]">{won(totalBudget)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
            <p className="text-xs text-gray-400 mt-2">
              ※ 사업명/예산현액 수정은 행을 삭제 후 다시 추가하거나 결산자료에서 집행 결과를 입력하세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
