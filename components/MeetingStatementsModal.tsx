'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { insertRows, deleteRows } from '@/lib/dataApi';
import { extractText, UPLOAD_ACCEPT } from '@/lib/extractText';
import {
  parseTurns,
  groupBySpeaker,
  buildAiPrompt,
  parseAiSummaries,
  type SpeakerGroup,
} from '@/lib/meetingParser';
import type { Meeting, MeetingStatement } from '@/lib/types';

function roleBadgeColor(role: string | null, isMember = false): string {
  if (!role) return '#6B7280';
  if (role.includes('위원장') || role.includes('의장')) return '#1F4E79';
  if (role === '위원' || role === '의원' || isMember) return '#2563EB';
  if (role === '기타') return '#9CA3AF';
  return '#B45309'; // 공무원 직책
}

export default function MeetingStatementsModal({
  meeting,
  onClose,
}: {
  meeting: Meeting;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<MeetingStatement[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);

  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [groups, setGroups] = useState<SpeakerGroup[]>([]);
  const [parsed, setParsed] = useState(false);

  const [summarizing, setSummarizing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [memberOnly, setMemberOnly] = useState(true);

  const fileRef = useRef<HTMLInputElement>(null);

  const loadSaved = useCallback(async () => {
    setLoadingSaved(true);
    const { data } = await supabase
      .from('meeting_statements')
      .select('*')
      .eq('meeting_id', meeting.id)
      .order('chars', { ascending: false });
    setSaved((data as MeetingStatement[]) ?? []);
    setLoadingSaved(false);
  }, [meeting.id]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function runParse(text: string) {
    const turns = parseTurns(text);
    const g = groupBySpeaker(turns);
    setGroups(g);
    setParsed(true);
    const members = g.filter((x) => x.isMember).length;
    setStatusMsg(
      g.length === 0
        ? '발언자를 인식하지 못했습니다. 회의록 형식(○이름 위원 …)을 확인하거나 텍스트를 직접 붙여넣어 보세요.'
        : `발언자 ${g.length}명 인식 (의원 ${members}명). 아래에서 요약을 생성·저장하세요.`,
    );
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setExtracting(true);
    setStatusMsg('파일에서 본문을 추출하는 중...');
    try {
      const res = await extractText(file);
      setFileName(file.name);
      if (!res.supported || !res.text) {
        setStatusMsg(
          `이 파일(.${res.ext})은 브라우저에서 본문 추출이 어렵습니다. 텍스트를 직접 붙여넣어 주세요.`,
        );
        setRawText('');
        return;
      }
      setRawText(res.text);
      runParse(res.text);
    } catch (err) {
      console.error(err);
      setStatusMsg('본문 추출에 실패했습니다. 텍스트를 직접 붙여넣어 주세요.');
    } finally {
      setExtracting(false);
    }
  }

  async function handleSummarizeSave() {
    if (groups.length === 0) return;
    setSummarizing(true);
    setStatusMsg('요약 생성 중... (AI 시도 후 실패 시 규칙기반)');

    // 1) AI 요약 시도 (키 없으면 실패 → 규칙기반 폴백)
    let aiMap: Record<string, string> = {};
    let aiUsed = false;
    try {
      const res = await fetch('/api/generate-query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          engine: 'claude',
          system:
            '당신은 지방의회 회의록을 분석하는 전문가입니다. 발언자별 핵심을 정확하고 간결하게 요약합니다.',
          prompt: buildAiPrompt(groups),
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (res.ok && data.text) {
        aiMap = parseAiSummaries(data.text);
        aiUsed = Object.keys(aiMap).length > 0;
      }
    } catch {
      // 네트워크 오류 → 규칙기반
    }

    // 2) 행 구성 (AI 요약 우선, 없으면 규칙기반)
    const rows = groups.map((g) => {
      const ai = aiMap[g.speaker];
      return {
        meeting_id: meeting.id,
        committee: meeting.committee,
        speaker: g.speaker,
        role: g.role,
        summary: ai || g.ruleSummary,
        turns: g.turns,
        chars: g.chars,
        method: ai ? 'ai' : 'rule',
      };
    });

    // 3) 기존 데이터 교체 후 저장
    await deleteRows('meeting_statements', { meeting_id: meeting.id });
    const { error } = await insertRows('meeting_statements', rows);
    if (error) {
      console.error(error);
      setStatusMsg('저장에 실패했습니다: ' + error.message);
    } else {
      setStatusMsg(
        aiUsed
          ? '✅ AI 요약으로 저장했습니다.'
          : '✅ 규칙기반 요약으로 저장했습니다. (AI 키 미설정 또는 응답 실패)',
      );
      setParsed(false);
      setGroups([]);
      setRawText('');
      setFileName('');
      await loadSaved();
    }
    setSummarizing(false);
  }

  async function handleClear() {
    if (!confirm('저장된 발언 요약을 모두 삭제할까요?')) return;
    await deleteRows('meeting_statements', { meeting_id: meeting.id });
    await loadSaved();
    setStatusMsg('저장된 요약을 삭제했습니다.');
  }

  const shownGroups = memberOnly ? groups.filter((g) => g.isMember) : groups;
  const shownSaved = memberOnly
    ? saved.filter(
        (s) =>
          s.role === '위원' ||
          s.role === '의원' ||
          (s.role ?? '').includes('위원장') ||
          (s.role ?? '').includes('의장'),
      )
    : saved;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-lg">
          <div>
            <h2 className="text-base font-bold text-[#1F4E79]">의원별 발언 요약</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {meeting.committee} · {meeting.date} ({meeting.year})
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 업로드 영역 */}
          <div className="rounded-lg border border-dashed border-gray-300 p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">1) 회의록 본문 입력</p>
            <input
              ref={fileRef}
              type="file"
              accept={UPLOAD_ACCEPT}
              onChange={handleFile}
              className="hidden"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={extracting}
                className="rounded-lg border border-[#1F4E79] bg-white px-3 py-1.5 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors disabled:opacity-40"
              >
                {extracting ? '추출 중...' : '회의록 파일 업로드'}
              </button>
              {fileName && <span className="text-xs text-gray-500">{fileName}</span>}
              <span className="text-xs text-gray-400">PDF · HWP · DOCX · TXT 지원</span>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                또는 텍스트 직접 붙여넣기
              </summary>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="회의록 본문을 붙여넣으세요. (예: ○홍길동 위원  ...발언...)"
                rows={6}
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/30"
              />
              <button
                onClick={() => runParse(rawText)}
                disabled={!rawText.trim()}
                className="mt-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                발언자 인식
              </button>
            </details>
          </div>

          {statusMsg && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded px-3 py-2">{statusMsg}</p>
          )}

          {/* 인식 결과 미리보기 + 저장 */}
          {parsed && groups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-medium text-gray-700">2) 요약 생성 및 저장</p>
                <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={memberOnly}
                    onChange={(e) => setMemberOnly(e.target.checked)}
                  />
                  의원만 보기
                </label>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {shownGroups.map((g) => (
                  <div key={`${g.speaker}-${g.role}`} className="rounded border border-gray-100 bg-gray-50 p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 text-sm">{g.speaker}</span>
                      <span
                        className="text-[10px] font-medium rounded px-1.5 py-0.5 text-white"
                        style={{ backgroundColor: roleBadgeColor(g.role, g.isMember) }}
                      >
                        {g.role}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        발언 {g.turns}회 · {g.chars.toLocaleString()}자
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{g.ruleSummary}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={handleSummarizeSave}
                disabled={summarizing}
                className="w-full rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163a5c] transition-colors disabled:opacity-50"
              >
                {summarizing ? '요약 생성·저장 중...' : 'AI 요약 생성 후 저장 (실패 시 규칙기반)'}
              </button>
            </div>
          )}

          {/* 저장된 요약 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">저장된 의원별 발언 요약</p>
              {saved.length > 0 && (
                <button
                  onClick={handleClear}
                  className="text-xs text-[#C62828] hover:underline"
                >
                  전체 삭제
                </button>
              )}
            </div>
            {loadingSaved ? (
              <p className="text-sm text-gray-400 py-4 text-center">불러오는 중...</p>
            ) : shownSaved.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                {saved.length === 0
                  ? '아직 저장된 요약이 없습니다. 위에서 회의록을 입력해 생성하세요.'
                  : '의원 발언이 없습니다. (의원만 보기 해제 시 전체 표시)'}
              </p>
            ) : (
              <div className="space-y-2">
                {shownSaved.map((s) => (
                  <div key={s.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{s.speaker}</span>
                      {s.role && (
                        <span
                          className="text-[10px] font-medium rounded px-1.5 py-0.5 text-white"
                          style={{ backgroundColor: roleBadgeColor(s.role) }}
                        >
                          {s.role}
                        </span>
                      )}
                      <span
                        className="text-[10px] font-medium rounded px-1.5 py-0.5"
                        style={{
                          backgroundColor: s.method === 'ai' ? '#EDE9FE' : '#F3F4F6',
                          color: s.method === 'ai' ? '#6D28D9' : '#6B7280',
                        }}
                      >
                        {s.method === 'ai' ? 'AI 요약' : '규칙기반'}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        발언 {s.turns}회 · {s.chars.toLocaleString()}자
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{s.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
