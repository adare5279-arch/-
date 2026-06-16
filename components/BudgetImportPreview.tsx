'use client';

import { useState } from 'react';
import { BUDGET_FIELDS } from '@/lib/types';
import { emptyDraft, type BudgetDraft } from '@/lib/importDoc';
import type { Department } from '@/lib/types';

type Props = {
  /** 추출된 초안 행들 (사람이 보정). */
  initial: BudgetDraft[];
  /** 원본에서 뽑은 평문 텍스트(있으면 참고용으로 표시). */
  rawText: string;
  /** 소관부서 선택지. */
  departments: Department[];
  /** 출처 설명 (예: "PDF: 2025예산.pdf"). */
  source: string;
  /** 파싱이 안 된 파일들에 대한 경고 메시지(선택). */
  warnings?: string[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (rows: BudgetDraft[]) => void;
};

const inputCls =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

export default function BudgetImportPreview({
  initial,
  rawText,
  departments,
  source,
  warnings = [],
  saving,
  onCancel,
  onConfirm,
}: Props) {
  const [rows, setRows] = useState<BudgetDraft[]>(
    initial.length ? initial : [emptyDraft()]
  );
  const [showRaw, setShowRaw] = useState(initial.length === 0 && !!rawText);

  const update = (i: number, k: keyof BudgetDraft, v: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const addRow = () => setRows((rs) => [...rs, emptyDraft()]);

  const valid = rows.filter((r) => r.program.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-[#1F4E79]">가져오기 미리보기 · 보정</h2>
            <p className="text-xs text-gray-500 mt-0.5">{source}</p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-3 overflow-auto grow">
          {warnings.length > 0 && (
            <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {warnings.map((w, i) => (
                <div key={i}>⚠️ {w}</div>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500 mb-2">
            자동 인식 결과입니다. 잘못 추출된 값은 직접 수정하고, 불필요한 행은 삭제한 뒤
            등록하세요. (예산현액 단위: 천원)
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600 text-xs">
                  <th className="py-1.5 px-1 font-semibold w-20">회계연도</th>
                  <th className="py-1.5 px-1 font-semibold w-28">분야</th>
                  <th className="py-1.5 px-1 font-semibold w-36">소관부서</th>
                  <th className="py-1.5 px-1 font-semibold">사업명</th>
                  <th className="py-1.5 px-1 font-semibold w-28">예산현액</th>
                  <th className="py-1.5 px-1 font-semibold w-32">비고</th>
                  <th className="py-1.5 px-1 font-semibold w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 align-top">
                    <td className="py-1 px-1">
                      <input
                        value={r.year}
                        onChange={(e) => update(i, 'year', e.target.value)}
                        className={inputCls}
                      />
                    </td>
                    <td className="py-1 px-1">
                      <select
                        value={r.field}
                        onChange={(e) => update(i, 'field', e.target.value)}
                        className={inputCls}
                      >
                        {BUDGET_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 px-1">
                      <input
                        list="dept-options"
                        value={r.dept}
                        onChange={(e) => update(i, 'dept', e.target.value)}
                        className={inputCls}
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        value={r.program}
                        onChange={(e) => update(i, 'program', e.target.value)}
                        className={`${inputCls} ${
                          r.program.trim() ? '' : 'border-red-300 bg-red-50'
                        }`}
                        placeholder="사업명 필수"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        value={r.budget}
                        onChange={(e) => update(i, 'budget', e.target.value.replace(/[^\d]/g, ''))}
                        className={`${inputCls} text-right`}
                        inputMode="numeric"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        value={r.note}
                        onChange={(e) => update(i, 'note', e.target.value)}
                        className={inputCls}
                      />
                    </td>
                    <td className="py-1 px-1 text-center">
                      <button
                        onClick={() => removeRow(i)}
                        className="text-xs text-[#C62828] hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="dept-options">
              {departments.map((d) => (
                <option key={d.id} value={d.name} />
              ))}
            </datalist>
          </div>

          <button
            onClick={addRow}
            className="mt-2 text-xs text-[#1F4E79] hover:underline"
          >
            + 행 추가
          </button>

          {rawText && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <button
                onClick={() => setShowRaw((s) => !s)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {showRaw ? '▼' : '▶'} 원본에서 추출한 텍스트 보기 (참고용)
              </button>
              {showRaw && (
                <pre className="mt-2 max-h-48 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-[11px] whitespace-pre-wrap text-gray-600">
                  {rawText}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          <p className="text-xs text-gray-500">
            등록 대상 {valid.length}건
            {rows.length - valid.length > 0
              ? ` (사업명 누락 ${rows.length - valid.length}건 제외)`
              : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              disabled={saving}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              취소
            </button>
            <button
              onClick={() => onConfirm(valid)}
              disabled={saving || valid.length === 0}
              className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] disabled:opacity-40"
            >
              {saving ? '등록 중...' : `${valid.length}건 등록`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
