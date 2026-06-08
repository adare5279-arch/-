'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { downloadAsDoc, escapeHtml } from '@/lib/exportDoc';
import {
  getOpenAiKey,
  setOpenAiKey,
  getAnthropicKey,
  setAnthropicKey,
  maskKey,
} from '@/lib/userKeys';
import type { MeetingMinutes } from '@/lib/types';

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = '.mp3,.m4a,.wav,.webm,.mp4,.ogg,.aac,.mpga,audio/*';

type Props = { committee: string | null };

export default function AudioMinutes({ committee }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioName, setAudioName] = useState('');
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<MeetingMinutes[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // 개별(개인) API 키 — 이 브라우저 localStorage에만 저장
  const [keyOpen, setKeyOpen] = useState(false);
  const [openaiKey, setOpenaiKeyState] = useState('');
  const [anthropicKey, setAnthropicKeyState] = useState('');
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    setOpenaiKeyState(getOpenAiKey());
    setAnthropicKeyState(getAnthropicKey());
  }, []);

  function saveKeys() {
    setOpenAiKey(openaiKey);
    setAnthropicKey(anthropicKey);
    setOpenaiKeyState(getOpenAiKey());
    setAnthropicKeyState(getAnthropicKey());
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  }

  function clearKeys() {
    setOpenAiKey('');
    setAnthropicKey('');
    setOpenaiKeyState('');
    setAnthropicKeyState('');
  }

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    const { data } = await supabase
      .from('meeting_minutes')
      .select('*')
      .eq('committee', committee)
      .eq('source', 'audio')
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
    setTranscript('');
    setSummary('');
    setAudioUrl('');
    setAudioName('');
    setPhase('');
  }

  async function handleRun() {
    if (!file) {
      setPhase('녹음 파일을 선택하세요.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setPhase(
        `파일이 ${(file.size / 1024 / 1024).toFixed(1)}MB로 한도(25MB)를 초과합니다. 더 짧게 나누거나 낮은 비트레이트(예: 64kbps 모노 MP3)로 변환해 주세요.`,
      );
      return;
    }
    setBusy(true);
    try {
      // 1) Supabase Storage 업로드 (Vercel 본문 한계 우회)
      setPhase('① 음성 파일 업로드 중...');
      const ext = file.name.split('.').pop() || 'bin';
      const path = `audio/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('meeting-audio')
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) {
        setPhase(`업로드 실패: ${upErr.message}`);
        setBusy(false);
        return;
      }
      const url = supabase.storage.from('meeting-audio').getPublicUrl(path).data.publicUrl;
      setAudioUrl(url);
      setAudioName(file.name);

      // 2) 음성 전사 (OpenAI Whisper)
      setPhase('② 음성을 텍스트로 전사 중... (길이에 따라 수십 초~수 분)');
      const trRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileUrl: url,
          fileName: file.name,
          language: 'ko',
          apiKey: getOpenAiKey(),
        }),
      });
      const trData = (await trRes.json()) as { text?: string; error?: string };
      if (!trRes.ok || trData.error) {
        setPhase(`전사 실패: ${trData.error ?? trRes.status}`);
        setBusy(false);
        return;
      }
      const tr = (trData.text ?? '').trim();
      setTranscript(tr);
      if (!tr) {
        setPhase('전사 결과가 비어 있습니다. 음성이 또렷한지 확인해 주세요.');
        setBusy(false);
        return;
      }

      // 3) AI 회의록 요약 (generate-query 재사용)
      setPhase('③ AI가 회의록으로 정리 중...');
      const system =
        '당신은 지방의회 회의록 정리 담당입니다. 행정사무감사 회의 음성 전사본을 바탕으로 ' +
        '공식 회의록 형식으로 정리합니다. 다음 구조의 마크다운으로 작성하세요: ' +
        '## 회의 개요(일시·안건 추정), ## 안건별 논의 요지(• 항목별), ## 주요 질의·답변(• Q/A 요지), ## 결정·조치사항. ' +
        '전사 오류로 보이는 표현은 문맥상 자연스럽게 보정하되 없는 사실을 지어내지 마세요. 공문 어투(~함, ~필요)로 간결하게.';
      const prompt = `다음은 회의 음성 전사본입니다. 회의록으로 정리하세요.\n\n[전사본]\n${tr}`;
      const sumRes = await fetch('/api/generate-query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine: 'claude', system, prompt, apiKey: getAnthropicKey() }),
      });
      const sumData = (await sumRes.json()) as { text?: string; error?: string };
      if (!sumRes.ok || sumData.error) {
        setSummary('');
        setPhase(`전사는 완료됐으나 AI 요약에 실패했습니다: ${sumData.error ?? sumRes.status}`);
      } else {
        setSummary((sumData.text ?? '').trim());
        setPhase('완료! 내용을 검토·수정한 뒤 저장하거나 다운로드하세요.');
      }
    } catch (e) {
      console.error('audio minutes error:', e);
      setPhase('처리 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!transcript && !summary) return;
    setSaving(true);
    const { error } = await supabase.from('meeting_minutes').insert({
      committee,
      source: 'audio',
      title: title || audioName || '제목 없는 회의',
      meeting_date: meetingDate || null,
      audio_url: audioUrl || null,
      audio_name: audioName || null,
      transcript: transcript || null,
      summary: summary || null,
    });
    setSaving(false);
    if (error) {
      console.error('save minutes error:', error);
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
      <h2>전사 전문(全文)</h2>
      <p>${escapeHtml(m.transcript || '(전사 없음)')}</p>
      <p class="muted">※ 음성 자동 전사·AI 요약 결과로 오류가 있을 수 있어 검수가 필요합니다.</p>`;
    downloadAsDoc(`회의록_${m.title || '제목없음'}`, body, m.title || '회의록');
  }

  async function handleDelete(id: number) {
    if (!confirm('이 회의록을 삭제하시겠습니까?')) return;
    const prev = list;
    setList((l) => l.filter((x) => x.id !== id));
    const { error } = await supabase.from('meeting_minutes').delete().eq('id', id);
    if (error) {
      console.error('delete minutes error:', error);
      setList(prev);
    }
  }

  const inputCls =
    'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-[#1F4E79]">녹음 자동 회의록 (AI)</h2>
          <p className="text-xs text-gray-500 mt-1">
            녹음 파일 업로드 → 한국어 자동 전사 → AI 회의록 정리. 요청당 25MB(약 50분) 이내.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setKeyOpen((s) => !s)}
            className="rounded-lg border border-[#6A1B9A] px-3 py-2 text-sm font-medium text-[#6A1B9A] hover:bg-[#6A1B9A] hover:text-white transition-colors"
          >
            개별 API 키 설정
          </button>
          <button
            onClick={() => setOpen((s) => !s)}
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
          >
            {open ? '닫기' : '+ 녹음 올리기'}
          </button>
        </div>
      </div>

      {/* 개별(개인) API 키 설정 — 이 브라우저에만 저장 */}
      {keyOpen && (
        <div className="rounded-lg border border-dashed border-[#6A1B9A]/40 bg-[#6A1B9A]/5 p-4 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed">
            본인 컴퓨터에서 개인 API 키로 이 기능을 사용할 수 있습니다. 입력한 키는{' '}
            <strong>이 브라우저에만 저장</strong>되며 서버·DB에 저장되지 않고, 요청 시에만 전달되어
            즉시 사용·폐기됩니다. 키를 비워 두면 서버 공용 키(설정된 경우)를 사용합니다.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              OpenAI API 키 <span className="text-xs text-gray-400">(음성 전사 — Whisper)</span>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKeyState(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                className={inputCls}
              />
              <span className="text-xs text-gray-400">
                현재: {getOpenAiKey() ? `개인 키 사용 (${maskKey(getOpenAiKey())})` : '서버 공용 키'}
              </span>
            </label>
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              Anthropic API 키 <span className="text-xs text-gray-400">(AI 회의록 정리 — Claude)</span>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKeyState(e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
                className={inputCls}
              />
              <span className="text-xs text-gray-400">
                현재:{' '}
                {getAnthropicKey() ? `개인 키 사용 (${maskKey(getAnthropicKey())})` : '서버 공용 키'}
              </span>
            </label>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={saveKeys}
              className="rounded-lg bg-[#6A1B9A] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
            >
              키 저장
            </button>
            <button
              onClick={clearKeys}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
            >
              키 삭제
            </button>
            {keySaved && <span className="text-xs text-[#2E7D32]">저장되었습니다.</span>}
          </div>
        </div>
      )}

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
            녹음 파일 (mp3·m4a·wav 등, 25MB 이내)
            <input
              type="file"
              accept={ACCEPT}
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
              {busy ? '처리 중...' : '전사 + 회의록 생성'}
            </button>
            {phase && (
              <span className={`text-xs ${busy ? 'text-[#B45309]' : 'text-gray-600'}`}>{phase}</span>
            )}
          </div>

          {(transcript || summary) && (
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
                전사 전문 (수정 가능)
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={6}
                  className={inputCls}
                />
              </label>
              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  onClick={() =>
                    downloadDoc({ title: title || audioName, date: meetingDate, summary, transcript })
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

      {/* 저장된 자동 회의록 목록 */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">저장된 자동 회의록</p>
        {loadingList ? (
          <p className="text-sm text-gray-500 py-3 text-center">불러오는 중...</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">아직 저장된 자동 회의록이 없습니다.</p>
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
