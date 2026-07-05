'use client';

import { useState } from 'react';
import { useCommittee } from '@/lib/CommitteeContext';
import { buildArchive, type ArchiveCategories } from '@/lib/buildArchive';

const CATEGORY_LABELS: { key: keyof ArchiveCategories; label: string; desc: string }[] = [
  { key: 'requests', label: '자료요구', desc: '자료요구서 및 첨부파일' },
  { key: 'issues', label: '지적사항', desc: '지적사항 첨부파일' },
  { key: 'witnesses', label: '증인·참고인', desc: '증인·참고인 첨부파일' },
  { key: 'minutes', label: '회의록', desc: '녹음·문서 회의록 원본 및 AI 정리본' },
];

export default function ArchivePage() {
  const { committee } = useCommittee();
  const [cats, setCats] = useState<ArchiveCategories>({
    requests: true,
    issues: true,
    witnesses: true,
    minutes: true,
  });
  const [includeIndex, setIncludeIndex] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [result, setResult] = useState<string>('');

  function toggle(key: keyof ArchiveCategories) {
    setCats((c) => ({ ...c, [key]: !c[key] }));
  }

  const anySelected = Object.values(cats).some(Boolean);

  async function handleBuild() {
    if (!committee || !anySelected) return;
    setBusy(true);
    setResult('');
    setProgress({ done: 0, total: 0, label: '자료를 모으는 중...' });
    try {
      const res = await buildArchive({
        committee,
        categories: cats,
        includeIndex,
        onProgress: (done, total, label) => setProgress({ done, total, label }),
      });

      // 다운로드 트리거
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setResult(
        `완료! 총 ${res.itemCount}개 항목을 ${res.folderCount}개 폴더로 정리했습니다 (담긴 파일 ${res.fileCount}개).` +
          (res.failures ? ` (첨부 ${res.failures}개는 내려받지 못함)` : ''),
      );
    } catch (e) {
      console.error('archive error:', e);
      setResult('생성 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
      setProgress({ done: 0, total: 0, label: '' });
    }
  }

  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : busy ? 5 : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1F4E79]">
          자료 정리 (자동 폴더 ZIP){committee ? ` — ${committee}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          선택한 위원회에 등록된 자료를 <strong>[소관 실국 &gt; 분류]</strong> 폴더 구조로 묶어
          압축파일(ZIP)로 내려받습니다. 부서는 <strong>위원회 소관 실국</strong>에 맞춰 자동
          분류되며, 첨부파일과 목록(CSV)이 함께 담깁니다.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-5">
        {/* 분류 선택 */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">포함할 자료 분류</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORY_LABELS.map((c) => (
              <label
                key={c.key}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  cats[c.key]
                    ? 'border-[#1F4E79] bg-[#1F4E79]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={cats[c.key]}
                  onChange={() => toggle(c.key)}
                  className="mt-0.5 h-4 w-4 accent-[#1F4E79]"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-800">{c.label}</span>
                  <span className="block text-xs text-gray-500">{c.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* 옵션 */}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeIndex}
            onChange={(e) => setIncludeIndex(e.target.checked)}
            className="h-4 w-4 accent-[#1F4E79]"
          />
          자료목록(CSV) 함께 포함 — 첨부가 없는 항목도 목록에 표기
        </label>

        {/* 폴더 구조 안내 */}
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 leading-relaxed">
          <p className="font-semibold text-gray-700 mb-1">생성되는 폴더 예시</p>
          <pre className="whitespace-pre-wrap font-mono text-[11px] text-gray-600">{`행감자료_${committee}/
├─ 의회사무처/             ← 위원회 소관 실국별
│   ├─ 자료요구/   (첨부 + 목록.csv)
│   └─ 지적사항/   (목록.csv)
├─ 공통(부서무관)/         ← 증인·회의록 등
│   ├─ 증인·참고인/
│   └─ 회의록/      (원본 + AI정리.txt)
├─ 기타(소관 외 부서)/     ← 소관 밖 부서 자료
│   └─ 자료요구/
├─ (자료 없는 소관 실국)/  (목록.csv만 생성)
└─ 자료목록.csv`}</pre>
        </div>

        {/* 진행 */}
        {busy && (
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-[#2E7D32] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 truncate">
              {progress.total > 0
                ? `${progress.done}/${progress.total} · ${progress.label}`
                : progress.label}
            </p>
          </div>
        )}

        {result && !busy && (
          <p className="text-sm text-[#2E7D32] font-medium">{result}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleBuild}
            disabled={busy || !anySelected}
            className="rounded-lg bg-[#1F4E79] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors disabled:opacity-50"
          >
            {busy ? '정리 중...' : '자료 폴더 ZIP 생성·다운로드'}
          </button>
          {!anySelected && (
            <span className="text-xs text-[#C62828]">분류를 1개 이상 선택하세요.</span>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        ※ 브라우저에서 직접 파일을 모아 압축하므로 자료가 많으면 다소 시간이 걸릴 수 있습니다.
        압축파일을 내려받아 PC에서 풀면 부서별 폴더로 정리된 상태로 사용할 수 있습니다.
      </p>
    </div>
  );
}
