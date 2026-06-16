'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { downloadAsDoc, escapeHtml } from '@/lib/exportDoc';
import { ggcLinkFor } from '@/lib/ggc';
import type { Member, Meeting, MeetingStatement } from '@/lib/types';

// 의원(위원)으로 분류되는 직책. 그 외(국장·실장·과장 등)는 실국장(공무원) 답변으로 묶는다.
const MEMBER_ROLES = new Set(['위원장', '부위원장', '위원', '의원', '의장', '부의장']);

function isOfficial(s: MeetingStatement): boolean {
  return !MEMBER_ROLES.has((s.role ?? '').trim());
}

// 4단 정리표 한 행: 주제 / 의원 발언 / 실국장 답변 / 조치사항
type TableRow = {
  meetingId: number;
  date: string;
  topic: string;
  member: string;
  reply: string;
  action: string;
};

// 후속조치(약속·검토·시정 등)로 보이는 문장을 답변에서 추출 — 규칙기반 폴백용
function extractAction(text: string): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentences = clean
    .split(/(?<=[.?!])\s+|(?<=[다요죠음함])\.\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hits = sentences.filter((s) =>
    /(검토|반영|조치|시정|개선|보완|추진|마련|협의|점검|확대|마무리|완료하겠|하겠습니다|예정)/.test(s),
  );
  return hits.slice(0, 2).join(' ');
}

// 첫 문장을 주제로 (없으면 앞 30자)
function deriveTopic(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '발언';
  const first = clean.split(/(?<=[.?!])\s+|(?<=[다요죠음함])\.\s+/)[0]?.trim() ?? clean;
  return first.length > 40 ? first.slice(0, 40) + '…' : first;
}

export default function StatementsPage() {
  const { committee } = useCommittee();

  const [members, setMembers] = useState<Member[]>([]);
  const [meetings, setMeetings] = useState<Map<number, Meeting>>(new Map());
  const [statements, setStatements] = useState<MeetingStatement[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  // AI 4단 정리표 상태
  const [aiRows, setAiRows] = useState<TableRow[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [memRes, meetRes, stmtRes] = await Promise.all([
      supabase.from('members').select('*').eq('committee', committee),
      supabase.from('meetings').select('*').eq('committee', committee),
      supabase.from('meeting_statements').select('*').eq('committee', committee),
    ]);
    const meetMap = new Map<number, Meeting>();
    ((meetRes.data as Meeting[]) ?? []).forEach((m) => meetMap.set(m.id, m));
    setMembers((memRes.data as Member[]) ?? []);
    setMeetings(meetMap);
    setStatements((stmtRes.data as MeetingStatement[]) ?? []);
    setLoading(false);
  }, [committee]);

  useEffect(() => {
    if (!committee) return;
    setSelected(null);
    setAiRows(null);
    setAiError('');
    load();
  }, [committee, load]);

  // 발언 기록이 있는 발언자 이름 집합 (회의록 파싱 결과 기준)
  const speakersWithStmt = useMemo(() => {
    const set = new Set<string>();
    statements.forEach((s) => {
      if (!isOfficial(s)) set.add(s.speaker.trim());
    });
    return set;
  }, [statements]);

  // 명부에 없지만 발언 기록만 있는 의원도 검색 가능하도록 합친 목록
  const memberNames = useMemo(() => {
    const set = new Set<string>();
    members.forEach((m) => set.add(m.name.trim()));
    speakersWithStmt.forEach((n) => set.add(n));
    return [...set];
  }, [members, speakersWithStmt]);

  const filteredNames = useMemo(() => {
    const q = query.trim();
    const names = q ? memberNames.filter((n) => n.includes(q)) : memberNames;
    // 발언 기록 있는 사람 먼저, 그다음 가나다순
    return names.sort((a, b) => {
      const aw = speakersWithStmt.has(a) ? 0 : 1;
      const bw = speakersWithStmt.has(b) ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.localeCompare(b, 'ko');
    });
  }, [memberNames, query, speakersWithStmt]);

  const selectedMember = useMemo(
    () => members.find((m) => m.name.trim() === selected) ?? null,
    [members, selected],
  );

  // 선택 의원의 회의별 발언 (날짜 내림차순)
  const memberStmts = useMemo(() => {
    if (!selected) return [];
    return statements
      .filter((s) => !isOfficial(s) && s.speaker.trim() === selected)
      .map((s) => ({ stmt: s, meeting: meetings.get(s.meeting_id) ?? null }))
      .sort((a, b) => {
        const da = a.meeting?.date ?? '';
        const db = b.meeting?.date ?? '';
        return db.localeCompare(da);
      });
  }, [selected, statements, meetings]);

  // 규칙기반 4단 정리표 (AI 호출 전 기본값 / 폴백)
  const ruleRows = useMemo<TableRow[]>(() => {
    return memberStmts.map(({ stmt, meeting }) => {
      const officials = statements.filter(
        (s) => s.meeting_id === stmt.meeting_id && isOfficial(s),
      );
      const reply = officials
        .map((o) => `${o.speaker} ${o.role ?? ''}: ${o.summary ?? ''}`.trim())
        .join('\n');
      const memberText = stmt.summary ?? '';
      return {
        meetingId: stmt.meeting_id,
        date: meeting?.date ?? '',
        topic: deriveTopic(memberText),
        member: memberText,
        reply,
        action: extractAction(reply),
      };
    });
  }, [memberStmts, statements]);

  const tableRows = aiRows ?? ruleRows;

  // AI로 4단 정리표 자동 생성
  async function generateTable() {
    if (!selected || memberStmts.length === 0) return;
    setAiBusy(true);
    setAiError('');
    try {
      const items = memberStmts.map(({ stmt, meeting }) => {
        const officials = statements
          .filter((s) => s.meeting_id === stmt.meeting_id && isOfficial(s))
          .map((o) => ({
            name: o.speaker,
            role: o.role ?? '',
            summary: (o.summary ?? '').slice(0, 800),
          }));
        return {
          date: meeting?.date ?? '',
          member: (stmt.summary ?? '').slice(0, 1200),
          officials,
        };
      });

      const system =
        '당신은 지방의회 행정사무감사 회의록 정리 전문가입니다. ' +
        '주어진 의원 발언 요약과 같은 회의의 실국장(공무원) 답변 요약을 바탕으로, ' +
        '회의별 주제를 뽑아 4단(주제·의원 발언·실국장 답변·조치사항) 표로 정리합니다.';

      const prompt =
        `'${selected}' 의원의 회의별 발언과, 같은 회의에서 실국장이 답변한 요약입니다.\n` +
        '각 회의에 대해 핵심 주제(topic)별로 의원 발언(member), 실국장 답변(reply), 조치사항(action)을 정리하세요.\n' +
        '- 한 회의에 주제가 여러 개면 여러 행으로 나누세요.\n' +
        '- 조치사항(action)은 답변에서 약속·검토·시정·개선 등 후속조치를 추출하고, 없으면 빈 문자열("")로 두세요.\n' +
        '- 날짜(date)는 입력의 회의 날짜를 그대로 사용하세요.\n' +
        '반드시 아래 형식의 JSON 배열로만 답하세요(다른 설명 금지):\n' +
        '[{"date":"날짜","topic":"주제","member":"의원 발언","reply":"실국장 답변","action":"조치사항"}]\n\n' +
        '=== 입력 데이터 ===\n' +
        JSON.stringify(items);

      const res = await fetch('/api/generate-query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine: 'claude', system, prompt }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `오류 ${res.status}`);

      const parsed = parseTableJson(data.text ?? '', memberStmts);
      if (parsed.length === 0) throw new Error('AI 응답을 표로 변환하지 못했습니다.');
      setAiRows(parsed);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  function handleHwp() {
    if (!selected) return;
    const esc = escapeHtml;
    const parts: string[] = [];
    parts.push(
      `<h1>${esc(selected)} 의원 회의 발언 정리</h1>`,
      `<p class="center muted">${esc(committee)} · 작성일 ${new Date().toISOString().slice(0, 10)}</p>`,
      '<hr/>',
    );

    if (tableRows.length === 0) {
      parts.push('<p class="muted">정리할 발언이 없습니다.</p>');
    } else {
      // 회의 날짜별로 묶어 표시 (표는 4단 고정: 주제/의원 발언/실국장 답변/조치사항)
      const byDate = new Map<string, TableRow[]>();
      tableRows.forEach((r) => {
        const k = r.date || '날짜 미상';
        byDate.set(k, [...(byDate.get(k) ?? []), r]);
      });
      [...byDate.keys()]
        .sort((a, b) => b.localeCompare(a))
        .forEach((date) => {
          parts.push(`<h2>${esc(date)}</h2>`);
          parts.push(
            '<table><tr><th style="width:20%">주제</th><th style="width:30%">의원 발언</th><th style="width:30%">실국장 답변</th><th style="width:20%">조치사항</th></tr>',
          );
          (byDate.get(date) ?? []).forEach((r) => {
            parts.push(
              `<tr><td>${esc(r.topic)}</td><td>${esc(r.member)}</td><td>${esc(r.reply)}</td><td>${esc(r.action)}</td></tr>`,
            );
          });
          parts.push('</table>');
        });
    }

    downloadAsDoc(
      `의원발언정리_${selected}_${committee}`,
      parts.join('\n'),
      `${selected} 의원 회의 발언 정리`,
    );
  }

  const ggcUrl = selected ? ggcLinkFor(committee, selected) : null;

  return (
    <div className="p-6 space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#1F4E79]">의원별 발언</h1>
          {committee && <span className="text-base font-medium text-gray-600">— {committee}</span>}
        </div>
        {selected && (
          <div className="flex gap-2">
            <button
              onClick={generateTable}
              disabled={aiBusy || memberStmts.length === 0}
              className="rounded-lg border border-[#B45309] bg-white px-4 py-2 text-sm font-medium text-[#B45309] hover:bg-[#B45309] hover:text-white transition-colors disabled:opacity-40"
            >
              {aiBusy ? 'AI 정리 중...' : 'AI 4단 정리표 생성'}
            </button>
            <button
              onClick={handleHwp}
              disabled={tableRows.length === 0}
              className="rounded-lg border border-[#1F4E79] bg-white px-4 py-2 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors disabled:opacity-40"
            >
              한글(HWP) 다운로드
            </button>
            <button
              onClick={() => window.print()}
              disabled={tableRows.length === 0}
              className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors disabled:opacity-40"
            >
              PDF 저장 / 인쇄
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-10 text-center">불러오는 중...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6">
          {/* 좌측: 의원 검색·목록 */}
          <aside className="space-y-3 print:hidden">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="의원 이름 검색"
              className="w-full rounded-lg border-2 border-[#1F4E79]/30 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#1F4E79]/60 focus:ring-2 focus:ring-[#1F4E79]/20"
            />
            <p className="text-xs text-gray-500">
              발언 기록 보유{' '}
              <strong className="text-[#1F4E79]">{speakersWithStmt.size}명</strong> · 검색결과{' '}
              {filteredNames.length}명
            </p>
            <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-50 max-h-[32rem] overflow-y-auto">
              {filteredNames.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">검색 결과가 없습니다.</p>
              ) : (
                filteredNames.map((name) => {
                  const has = speakersWithStmt.has(name);
                  const active = selected === name;
                  return (
                    <button
                      key={name}
                      onClick={() => {
                        setSelected(name);
                        setAiRows(null);
                        setAiError('');
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-sm transition-colors ${
                        active ? 'bg-[#1F4E79]/10 text-[#1F4E79] font-semibold' : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span>{name}</span>
                      {has ? (
                        <span className="text-[10px] rounded-full bg-[#2E7D32]/10 text-[#2E7D32] px-2 py-0.5">
                          발언 있음
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-300">기록 없음</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* 우측: 선택 의원 발언 */}
          <section className="min-w-0">
            {!selected ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-sm text-gray-500">
                왼쪽에서 의원을 선택하면 해당 의원의 회의별 발언이 정리되어 표시됩니다.
              </div>
            ) : (
              <div className="report-doc bg-white rounded-lg border border-gray-200 shadow-sm p-6 sm:p-8 space-y-6 print:border-0 print:shadow-none print:p-0">
                {/* 의원 헤더 */}
                <div className="flex items-center justify-between gap-3 border-b-2 border-gray-800 pb-4 flex-wrap">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{selected} 의원</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {[selectedMember?.role, selectedMember?.party, selectedMember?.district]
                        .filter(Boolean)
                        .join(' · ') || committee}
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    <p>{committee}</p>
                    <p>발언 회의 {memberStmts.length}건</p>
                    {ggcUrl && (
                      <a
                        href={ggcUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1F4E79] underline print:hidden"
                      >
                        경기도의회 ↗
                      </a>
                    )}
                  </div>
                </div>

                {aiError && (
                  <p className="text-xs text-red-600 print:hidden">AI 생성 실패: {aiError} (규칙기반 정리를 표시합니다)</p>
                )}

                {memberStmts.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">
                    이 의원의 발언 기록이 없습니다. 회의록 화면에서 회의록을 업로드·분석하면 발언이 정리됩니다.
                  </p>
                ) : (
                  <>
                    {/* 4단 정리표 */}
                    <div>
                      <div className="flex items-baseline justify-between mb-2">
                        <h3 className="text-lg font-bold text-gray-900 border-l-4 border-[#1F4E79] pl-3">
                          발언 정리표 (주제·의원 발언·실국장 답변·조치사항)
                        </h3>
                        <span className="text-xs text-gray-400 print:hidden">
                          {aiRows ? 'AI 정리' : '자동(규칙기반) — AI 생성 버튼으로 보강'}
                        </span>
                      </div>
                      <div className="overflow-x-auto print:overflow-visible">
                        <table className="w-full text-sm border border-gray-400 border-collapse">
                          <thead>
                            <tr className="bg-gray-100 text-left">
                              <th className="border border-gray-400 py-2 px-3 font-semibold w-12 text-center">날짜</th>
                              <th className="border border-gray-400 py-2 px-3 font-semibold">주제</th>
                              <th className="border border-gray-400 py-2 px-3 font-semibold">의원 발언</th>
                              <th className="border border-gray-400 py-2 px-3 font-semibold">실국장 답변</th>
                              <th className="border border-gray-400 py-2 px-3 font-semibold">조치사항</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tableRows.map((r, i) => (
                              <tr key={i} className="align-top">
                                <td className="border border-gray-400 py-2 px-3 text-center text-gray-500 whitespace-nowrap">
                                  {r.date || '—'}
                                </td>
                                <td className="border border-gray-400 py-2 px-3 text-gray-900 font-medium">{r.topic}</td>
                                <td className="border border-gray-400 py-2 px-3 text-gray-800 whitespace-pre-wrap">{r.member || '—'}</td>
                                <td className="border border-gray-400 py-2 px-3 text-gray-700 whitespace-pre-wrap">{r.reply || '—'}</td>
                                <td className="border border-gray-400 py-2 px-3 text-gray-700 whitespace-pre-wrap">{r.action || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 회의별 발언 카드 (읽기 편한 형태) */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-bold text-gray-900 border-l-4 border-[#2E7D32] pl-3">
                        회의별 발언 요약
                      </h3>
                      {memberStmts.map(({ stmt, meeting }) => (
                        <div
                          key={stmt.id}
                          className="rounded-lg border border-gray-200 p-4 print:break-inside-avoid"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                            <span className="font-semibold text-gray-800">
                              {meeting?.date ?? '날짜 미상'}
                              {meeting?.year ? ` · ${meeting.year}년` : ''}
                            </span>
                            <span className="text-xs text-gray-400">
                              {stmt.role ?? '위원'} · 발언 {stmt.turns}회 · {stmt.chars}자 · {stmt.method === 'ai' ? 'AI 요약' : '규칙 요약'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                            {stmt.summary || '요약 없음'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// AI 응답(JSON 배열) → TableRow[]. 날짜가 비면 회의 순서로 보정.
function parseTableJson(
  text: string,
  memberStmts: { stmt: MeetingStatement; meeting: Meeting | null }[],
): TableRow[] {
  if (!text) return [];
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    const arr = JSON.parse(text.slice(start, end + 1)) as Array<{
      date?: string;
      topic?: string;
      member?: string;
      reply?: string;
      action?: string;
    }>;
    // 날짜 → meetingId 역매핑 (HWP/표 정렬용)
    const dateToId = new Map<string, number>();
    memberStmts.forEach(({ stmt, meeting }) => {
      if (meeting?.date) dateToId.set(meeting.date, stmt.meeting_id);
    });
    return arr
      .filter((r) => r && (r.topic || r.member || r.reply))
      .map((r) => {
        const date = (r.date ?? '').trim();
        return {
          meetingId: dateToId.get(date) ?? 0,
          date,
          topic: (r.topic ?? '').trim(),
          member: (r.member ?? '').trim(),
          reply: (r.reply ?? '').trim(),
          action: (r.action ?? '').trim(),
        };
      });
  } catch {
    return [];
  }
}
