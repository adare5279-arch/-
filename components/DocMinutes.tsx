'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { insertRows, deleteRows } from '@/lib/dataApi';
import { extractText, UPLOAD_ACCEPT } from '@/lib/extractText';
import { downloadAsDoc, escapeHtml } from '@/lib/exportDoc';
import type { MeetingMinutes } from '@/lib/types';

type Props = { committee: string | null };

export default function DocMinutes({ committee }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [source, setSource] = useState(''); // 추출된 원문 텍스트
  const [summary, setSummary] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<MeetingMinutes[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    const { data } = await supabase
      .from('meeting_minutes')
      .select('*')
      .eq('committee', committee)
      .eq('source', 'doc')
      .order('created_at', { ascending: false });
    setList((data as MeetingMinutes[]) ?? []);
    setLoadingList(false);
  }, [committee]);

  useEffect(() => {
    if (committee) fetchList();
  }, [committee, fetchList]);

  function reset() {
    setFile(null);
    setTitle('');
    setMeetingDate('');
    setSource('');
    setSummary('');
    setFileUrl('');
    setFileName('');
    setPhase('');
  }

  async function handleRun() {
    if (!file) {
      setPhase('문서 파일을 선택하세요.');
      return;
    }
    setBusy(true);
    try {
      // 1) 문서 본문 추출 (브라우저에서)
      setPhase('① 문서 본문 추출 중...');
      const { text, supported, ext } = await extractText(file);
      if (!supported || !text.trim()) {
        setPhase(
          `이 형식(.${ext || '?'})은 본문 자동 추출이 어렵습니다. txt·docx·pdf·xlsx·hwp 등으로 변환해 다시 시도하세요.`,
        );
        setBusy(false);
        return;
      }
      setSource(text.trim());

      // 2) 원본 파일 보관 (참고 링크)
      const path = `docs/${crypto.randomUUID()}.${ext || 'bin'}`;
      const { error: upErr } = await supabase.storage
        .from('report-files')
        .upload(path, file, { upsert: true });
      if (!upErr) {
        setFileUrl(supabase.storage.from('report-files').getPublicUrl(path).data.publicUrl);
      }
      setFileName(file.name);

      // 3) AI 회의록 정리 (generate-query 재사용)
      setPhase('② AI가 회의록으로 정리 중...');
      const system =
        '당신은 지방의회 회의록 정리 담당입니다. 행정사무감사 관련 문서(녹취록·속기 초안·메모·발언자료 등)를 ' +
        '공식 회의록 형식으로 정리합니다. 다음 구조의 마크다운으로 작성하세요: ' +
        '## 회의 개요(일시·안건 추정), ## 안건별 논의 요지(• 항목별), ## 주요 질의·답변(• Q/A 요지), ## 결정·조치사항. ' +
        '원문에 없는 사실을 지어내지 말고, 표·반복 머리글 등 잡음은 정리하세요. 공문 어투(~함, ~필요)로 간결하게.';
      const prompt = `다음은 회의 관련 문서 원문입니다. 회의록으로 정리하세요.\n\n[문서 원문]\n${text.trim()}`;
      const res = await fetch('/api/generate-query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine: 'claude', system, prompt }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) {
        setSummary('');
        setPhase(`본문 추출은 완료되었습니다. AI 정리만 실패했어요(${data.error ?? res.status}). 아래 문서 원문을 직접 정리해 저장하거나, 잠시 후 다시 시도해 주세요.`);
      } else {
        setSummary((data.text ?? '').trim());
        setPhase('완료! 내용을 검토·수정한 뒤 저장하거나 다운로드하세요.');
      }
    } catch (e) {
      console.error('doc minutes error:', e);
      setPhase('처리 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!source && !summary) return;
    setSaving(true);
    const { error } = await insertRows('meeting_minutes', {
      committee,
      source: 'doc',
      title: title || fileName || '제목 없는 회의',
      meeting_date: meetingDate || null,
      audio_url: fileUrl || null,
      audio_name: fileName || null,
      transcript: source || null,
      summary: summary || null,
    });
    setSaving(false);
    if (error) {
      console.error('save doc minutes error:', error);
      alert('저장에 실패했습니다.');
      return;
    }
    reset();
    setOpen(false);
    await fetchList();
  }

  function downloadDoc(m: { title: string; date: string; summary: string; transcript: string }) {
    const body = `
      <h1>${escapeHtml(m.title || '회의록')}</h1>
      <p class="center muted">${escapeHtml(committee ?? '')}${m.date ? ` · ${escapeHtml(m.date)}` : ''}</p>
      <h2>AI 정리 회의록</h2>
      <p>${escapeHtml(m.summary || '(요약 없음)')}</p>
      <h2>문서 원문</h2>
      <p>${escapeHtml(m.transcript || '(원문 없음)')}</p>
      <p class="muted">※ 문서 기반 AI 정리 결과로 오류가 있을 수 있어 검수가 필요합니다.</p>`;
    downloadAsDoc(`회의록_${m.title || '제목없음'}`, body, m.title || '회의록');
  }

  async function handleDelete(id: number) {
    if (!confirm('이 회의록을 삭제하시겠습니까?')) return;
    const prev = list;
    setList((l) => l.filter((x) => x.id !== id));
    const { error } = await deleteRows('meeting_minutes', { id });
    if (error) {
      console.error('delete doc minutes error:', error);
      setList(prev);
    }
  }

  const inputCls =
    'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-[#1F4E79]">문서 자동 회의록 (AI)</h2>
          <p className="text-xs text-gray-500 mt-1">
            녹취록·속기 초안·메모 등 문서 업로드 → 본문 추출 → AI 회의록 정리. (txt·docx·pdf·xlsx·hwp)
          </p>
        </div>
        <button
          onClick={() => setOpen((s) => !s)}
          className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
        >
          {open ? '닫기' : '+ 문서 올리기'}
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-dashed border-[#1F4E79]/40 bg-[#1F4E79]/5 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              회의 제목
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 2025년도 행정사무감사 (건설교통국)"
                className={inputCls}
              />
            </label>
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              회의 일자
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            문서 파일 (txt·docx·pdf·xlsx·hwp 등)
            <input
              type="file"
              accept={UPLOAD_ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              className="text-xs file:mr-2 file:rounded file:border-0 file:bg-[#1F4E79] file:px-3 file:py-1.5 file:text-white file:cursor-pointer disabled:opacity-50"
            />
          </label>
          {file && (
            <p className="text-xs text-gray-600">
              선택됨: {file.name} ({(file.size / 1024 / 1024).toFixed(1)}MB)
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRun}
              disabled={busy || !file}
              className="rounded-lg bg-[#2E7D32] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {busy ? '처리 중...' : '본문 추출 + 회의록 생성'}
            </button>
            {phase && (
              <span className={`text-xs ${busy ? 'text-[#B45309]' : 'text-gray-600'}`}>{phase}</span>
            )}
          </div>

          {(source || summary) && (
            <div className="space-y-3 pt-2">
              <label className="text-sm text-gray-700 flex flex-col gap-1">
                AI 정리 회의록 (수정 가능)
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={8}
                  className={inputCls}
                />
              </label>
              <label className="text-sm text-gray-700 flex flex-col gap-1">
                문서 원문 (수정 가능)
                <textarea
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  rows={6}
                  className={inputCls}
                />
              </label>
              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  onClick={() =>
                    downloadDoc({ title: title || fileName, date: meetingDate, summary, transcript: source })
                  }
                  className="rounded-lg border border-[#1F4E79] px-4 py-2 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors"
                >
                  문서 다운로드(.doc)
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '회의록 저장'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 저장된 문서 회의록 목록 */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">저장된 문서 회의록</p>
        {loadingList ? (
          <p className="text-sm text-gray-500 py-3 text-center">불러오는 중...</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">아직 저장된 문서 회의록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.map((m) => (
              <li key={m.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{m.title || '제목 없음'}</p>
                  <p className="text-xs text-gray-400">
                    {m.meeting_date || m.created_at.slice(0, 10)}
                    {m.audio_name ? ` · ${m.audio_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() =>
                      downloadDoc({
                        title: m.title ?? '',
                        date: m.meeting_date ?? '',
                        summary: m.summary ?? '',
                        transcript: m.transcript ?? '',
                      })
                    }
                    className="text-xs text-[#1F4E79] hover:underline"
                  >
                    다운로드
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="text-xs text-[#C62828] hover:underline"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
