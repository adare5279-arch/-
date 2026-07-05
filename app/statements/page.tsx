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
const ACTION_RE = /(검토|반영|조치|시정|개선|보완|추진|마련|협의|점검|확대|마무리|완료하겠|하겠습니다|예정|보고드리|보고하겠|시행)/;

function actionSentences(text: string): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentences = clean
    .split(/(?<=[.?!])\s+|(?<=[다요죠음함])\.\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hits = sentences.filter((s) => ACTION_RE.test(s));
  return hits.slice(0, 2).join(' ');
}

// 실국장(공무원)별로 조치사항을 구분 — 누가 무엇을 하기로 했는지
function extractActionByOfficial(
  officials: { speaker: string; role?: string | null; summary?: string | null }[],
): string {
  const lines: string[] = [];
  for (const o of officials) {
    const act = actionSentences(o.summary ?? '');
    if (!act) continue;
    const who = `${o.role ?? ''} ${o.speaker}`.trim() || o.speaker;
    lines.push(`○${who}: ${act}`);
  }
  return lines.join('\n');
}

// 자기소개·인사말·맞장구 문장은 주제 후보에서 제외
const TOPIC_DROP =
  /(안녕하십니까|반갑습니다|수고\s*많|고생\s*많|감사합니다|감사드립니다|위원입니다|의원입니다|국장입니다|실장입니다|과장입니다|본부장입니다|대표이사|입니다$|잘\s*들었|들었습니다|들었어요|좋은\s*질문|말씀\s*감사|동의합니다)/;
// 호칭(처장님,/○○ 위원님, 등) — 반드시 "님"이 있어야 호칭으로 간주(일반 명사 오인 방지)
const TOPIC_ADDRESS =
  /^[가-힣]{1,4}\s*(위원장|부위원장|위원|의원|처장|국장|실장|과장|본부장|단장|소장|부장|팀장|장관)?\s*님\s*[,，]?\s*/;
// 시점 부사(작년 행감 때 / 지난번에 / 이번 등)
const TOPIC_TIME =
  /^(작년|올해|금년|지난해|지난번|지난|이번|오늘|어제|최근|당시|현재|지금|그때)\s*[가-힣0-9]*\s*(행감|감사|회기|정례회|때|에|년도?|분기|차)?\s*(에는|에|은|는)?\s*/;
// 핵심 쟁점어 — 이 단어에서 끊으면 "○○ 부족", "○○ 미흡" 식의 짧은 주제가 됨
const TOPIC_ISSUE =
  /(부족|미흡|미비|부실|누락|지연|과다|과소|초과|위반|부적정|불용|중복|오류|문제|지적|개선|시정|보완|요청|건의|촉구|반대|우려|질타|확대|점검|재검토|필요|저조|저하|줄어|줄었|감소|축소)/;

function deriveTopic(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '발언';
  const sentences = clean
    .split(/(?<=[.?!])\s+|(?<=[다요죠음함])\.\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
  // 인사·자기소개가 아닌 첫 실질 문장
  let s = sentences.find((x) => !TOPIC_DROP.test(x)) ?? sentences[0] ?? clean;
  // 호칭·시점 부사·끝 문장부호·접속사 제거
  s = s
    .replace(TOPIC_ADDRESS, '')
    .replace(/^(그런데|그리고|그래서|그러면|그러니까|또한|또|근데|아니|일단|이제|자|네|예|뭐)\s+/, '')
    .replace(TOPIC_TIME, '')
    .replace(/[.?!]+$/, '')
    .trim();

  // 쟁점어가 있으면 그 지점까지만 잘라 "…사전설명이 부족" 같은 짧은 명사구로
  const m = s.match(TOPIC_ISSUE);
  if (m && (m.index ?? 0) > 1) {
    let phrase = s.slice(0, (m.index ?? 0) + m[0].length).trim();
    // 쟁점어 앞 주격조사 정리: "사전설명이 부족" → "사전설명 부족"
    phrase = phrase.replace(/(이|가|을|를)\s+(?=[가-힣]+$)/, ' ');
    if (phrase.length >= 4) return phrase.length > 28 ? phrase.slice(0, 28) + '…' : phrase;
  }

  // 쟁점어가 없으면 연결어미·진행멘트 앞에서 끊고 앞부분만
  let topic = s
    .replace(/(에 대해서|에 대해|에 관해서|에 관해|관련해서|관련하여|말씀드리면|질의하겠습니다|여쭤보겠습니다|하겠습니다|하니까|한데|있습니다|싶습니다).*$/, '')
    .replace(/\s*(을|를)?\s*좀?\s*(보겠습니다|살펴보겠습니다|확인하겠습니다|여쭤보겠습니다|말씀해\s*주십시오|설명해\s*주십시오)\s*$/, '')
    .replace(/(을|를)\s*$/, '')
    .trim();
  if (topic.length < 4) topic = s;
  return topic.length > 24 ? topic.slice(0, 24) + '…' : topic;
}

export default function StatementsPage() {
  const { committee } = useCommittee();

  const [members, setMembers] = useState<Member[]>([]);
  const [meetings, setMeetings] = useState<Map<number, Meeting>>(new Map());
  const [statements, setStatements] = useState<MeetingStatement[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  // 특정 회의만 보기 (null = 전체 회의)
  const [meetingFilter, setMeetingFilter] = useState<number | null>(null);

  // AI 4단 정리표 상태 — 회의별로 캐시 (토큰 한도·정확도 때문에 회의 단위로 생성)
  const [aiByMeeting, setAiByMeeting] = useState<Record<number, TableRow[]>>({});
  const [aiBusy, setAiBusy] = useState<number | 'all' | null>(null);
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
    setAiByMeeting({});
    setAiError('');
    setMeetingFilter(null);
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
        action: extractActionByOfficial(officials),
      };
    });
  }, [memberStmts, statements]);

  // 회의별 규칙기반 행 (AI 캐시가 없을 때 폴백)
  const ruleByMeeting = useMemo(() => {
    const map = new Map<number, TableRow[]>();
    ruleRows.forEach((r) => map.set(r.meetingId, [...(map.get(r.meetingId) ?? []), r]));
    return map;
  }, [ruleRows]);

  // 회의 하나의 표시용 행: AI 캐시 우선, 없으면 규칙기반
  const rowsFor = useCallback(
    (mid: number): TableRow[] => aiByMeeting[mid] ?? ruleByMeeting.get(mid) ?? [],
    [aiByMeeting, ruleByMeeting],
  );

  // 선택 의원이 발언한 회의 목록 (칩 선택용, 날짜 내림차순)
  const memberMeetings = useMemo(() => {
    const seen = new Map<number, { id: number; date: string; year?: number }>();
    memberStmts.forEach(({ stmt, meeting }) => {
      if (!seen.has(stmt.meeting_id))
        seen.set(stmt.meeting_id, {
          id: stmt.meeting_id,
          date: meeting?.date ?? '',
          year: meeting?.year,
        });
    });
    return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [memberStmts]);

  // 회의 필터가 걸리면 해당 회의 행만, 아니면 전체 회의를 이어붙임
  const visibleRows = useMemo(
    () => (meetingFilter == null ? [] : rowsFor(meetingFilter)),
    [meetingFilter, rowsFor],
  );

  // 현재 화면에 AI 정리가 적용됐는지
  const usingAi = useMemo(
    () =>
      meetingFilter == null
        ? memberMeetings.some((mm) => aiByMeeting[mm.id])
        : Boolean(aiByMeeting[meetingFilter]),
    [meetingFilter, memberMeetings, aiByMeeting],
  );

  // 화면에 보일 회의별 카드 (필터 반영)
  const visibleStmts = useMemo(
    () => (meetingFilter == null ? [] : memberStmts.filter(({ stmt }) => stmt.meeting_id === meetingFilter)),
    [memberStmts, meetingFilter],
  );

  // 선택된 회의 라벨/원문 링크
  const activeMeeting = useMemo(
    () => memberMeetings.find((m) => m.id === meetingFilter) ?? null,
    [memberMeetings, meetingFilter],
  );
  const kmsUrl = (id: number) => `https://kms.ggc.go.kr/cms/mntsViewer.do?mntsId=${id}`;

  // 회의 한 건을 AI로 4단 표 정리 (집중·정확, 토큰 한도 내)
  const generateForMeeting = useCallback(
    async (mid: number): Promise<boolean> => {
      if (!selected) return false;
      const scope = memberStmts.filter(({ stmt }) => stmt.meeting_id === mid);
      if (scope.length === 0) return false;
      const items = scope.map(({ stmt, meeting }) => {
        const officials = statements
          .filter((s) => s.meeting_id === stmt.meeting_id && isOfficial(s))
          .slice(0, 8)
          .map((o) => ({
            name: o.speaker,
            role: o.role ?? '',
            summary: (o.summary ?? '').slice(0, 600),
          }));
        return {
          date: meeting?.date ?? '',
          member: (stmt.summary ?? '').slice(0, 1500),
          officials,
        };
      });

      const system =
        '당신은 지방의회 행정사무감사 회의록 정리 전문가입니다. ' +
        '속기 그대로가 아니라, 핵심을 간추려 일목요연한 4단 표(주제·의원 발언·실국장 답변·조치사항)로 정리합니다. ' +
        '인사말·자기소개·진행멘트는 버리고 실제 안건만 다룹니다.';

      const prompt =
        `'${selected}' 의원의 회의 발언과, 같은 회의에서 실국장(공무원)이 답변한 내용입니다.\n` +
        '아래 규칙으로 주제별 4단 표를 만드세요.\n' +
        '1) topic(주제): 그 사안을 가리키는 6~16자 내외의 간결한 명사형 제목. ' +
        '예: "아이돌봄서비스 운영", "주차장 건립 용역", "청년 일자리 예산". ' +
        '인사말이나 "OO 위원입니다" 같은 문장을 절대 주제로 쓰지 마세요. ' +
        '서술형 문장이 아니라 핵심어 위주의 짧은 제목으로 쓰세요.\n' +
        '2) member(의원 발언): 속기 문장을 그대로 옮기지 말고, 의원이 무엇을 지적·질의·요구했는지 1~2문장으로 요약.\n' +
        '3) reply(실국장 답변): 담당 공무원이 어떻게 답했는지 1~2문장으로 요약. 답변이 없으면 "".\n' +
        '4) action(조치사항): 후속조치를 실국장(공무원)별로 구분해서 누가 무엇을 하기로 했는지 쓰세요. ' +
        '형식은 줄바꿈(\\n)으로 구분하여 "○홍길동 국장: 과업지시서 재검토 후 보고" 처럼 직책·이름과 조치를 함께 쓰세요. ' +
        '약속된 후속조치(검토·반영·시정·개선·재발방지 등)가 없으면 "".\n' +
        '5) 한 회의에 사안이 여러 개면 사안마다 행을 나누세요. date는 입력 날짜를 그대로 쓰세요.\n' +
        '반드시 아래 형식의 JSON 배열로만 답하세요(다른 설명 금지):\n' +
        '[{"date":"날짜","topic":"주제","member":"의원 발언 요약","reply":"실국장 답변 요약","action":"실국장별 조치사항"}]\n\n' +
        '=== 입력 데이터 ===\n' +
        JSON.stringify(items);

      const { callAi } = await import('@/lib/aiSettings');
      const data = await callAi({ system, prompt });
      if (data.error) throw new Error(data.error);

      const parsed = parseTableJson(data.text ?? '', scope);
      if (parsed.length === 0) throw new Error('AI 응답을 표로 변환하지 못했습니다.');
      // 날짜만으로 meetingId가 안 잡히는 경우를 대비해 강제 보정
      const fixed = parsed.map((r) => ({ ...r, meetingId: mid }));
      setAiByMeeting((prev) => ({ ...prev, [mid]: fixed }));
      return true;
    },
    [selected, memberStmts, statements],
  );

  // 현재 보고 있는 범위를 AI로 정리 (회의 선택 시 그 회의, 전체면 모든 회의 순차)
  async function generateTable() {
    if (!selected || memberMeetings.length === 0) return;
    setAiError('');
    try {
      if (meetingFilter != null) {
        setAiBusy(meetingFilter);
        await generateForMeeting(meetingFilter);
      } else {
        setAiBusy('all');
        for (const mm of memberMeetings) {
          if (aiByMeeting[mm.id]) continue;
          await generateForMeeting(mm.id);
        }
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(null);
    }
  }

  // 의원을 선택하면 가장 최근 회의 날짜를 기본 선택 (전체를 통으로 보여주지 않음)
  useEffect(() => {
    if (selected && meetingFilter == null && memberMeetings.length > 0) {
      setMeetingFilter(memberMeetings[0].id);
    }
  }, [selected, meetingFilter, memberMeetings]);

  // 회의를 선택하면 그 회의를 자동으로 AI 정리 (캐시에 없을 때 1회)
  useEffect(() => {
    if (
      selected &&
      meetingFilter != null &&
      !aiByMeeting[meetingFilter] &&
      aiBusy == null &&
      !aiError
    ) {
      setAiBusy(meetingFilter);
      generateForMeeting(meetingFilter)
        .catch((e) => setAiError(e instanceof Error ? e.message : String(e)))
        .finally(() => setAiBusy(null));
    }
  }, [selected, meetingFilter, aiByMeeting, aiBusy, aiError, generateForMeeting]);

  function handleHwp() {
    if (!selected) return;
    const esc = escapeHtml;
    const rows = visibleRows;
    const scopeLabel = activeMeeting ? `${activeMeeting.date} 회의` : '전체 회의';
    const parts: string[] = [];
    parts.push(
      `<h1>${esc(selected)} 의원 회의 발언 정리</h1>`,
      `<p class="center muted">${esc(committee)} · ${esc(scopeLabel)} · 작성일 ${new Date().toISOString().slice(0, 10)}</p>`,
      '<hr/>',
    );

    if (rows.length === 0) {
      parts.push('<p class="muted">정리할 발언이 없습니다.</p>');
    } else {
      // 회의 날짜별로 묶어 표시 (표는 4단 고정: 주제/의원 발언/실국장 답변/조치사항)
      const byDate = new Map<string, TableRow[]>();
      rows.forEach((r) => {
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
              `<tr><td>${esc(r.topic)}</td><td>${esc(r.member)}</td><td>${esc(r.reply).replace(/\n/g, '<br>')}</td><td>${esc(r.action).replace(/\n/g, '<br>')}</td></tr>`,
            );
          });
          parts.push('</table>');
        });
    }

    downloadAsDoc(
      `의원발언정리_${selected}_${activeMeeting ? activeMeeting.date : committee}`,
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
              disabled={aiBusy != null || memberStmts.length === 0}
              className="rounded-lg border border-[#B45309] bg-white px-4 py-2 text-sm font-medium text-[#B45309] hover:bg-[#B45309] hover:text-white transition-colors disabled:opacity-40"
            >
              {aiBusy != null
                ? 'AI 정리 중...'
                : activeMeeting
                  ? '이 회의 AI로 다시 정리'
                  : 'AI 4단 정리표 생성(전체)'}
            </button>
            <button
              onClick={handleHwp}
              disabled={visibleRows.length === 0}
              className="rounded-lg border border-[#1F4E79] bg-white px-4 py-2 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors disabled:opacity-40"
            >
              {activeMeeting ? '이 회의 표 다운로드' : '한글(HWP) 다운로드'}
            </button>
            <button
              onClick={() => window.print()}
              disabled={visibleRows.length === 0}
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
                        setAiByMeeting({});
                        setAiError('');
                        setMeetingFilter(null);
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
                    {/* 회의 선택 — 특정 회의를 고르면 그 회의만 표로 정리해 다운로드 */}
                    <div className="print:hidden">
                      <p className="text-xs font-semibold text-gray-500 mb-2">
                        회의 날짜 선택 — 날짜를 고르면 그 회의만 표로 정리됩니다 (총 {memberMeetings.length}회)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {memberMeetings.map((mm) => (
                          <button
                            key={mm.id}
                            onClick={() => {
                              setMeetingFilter(mm.id);
                              setAiError('');
                            }}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              meetingFilter === mm.id
                                ? 'border-[#1F4E79] bg-[#1F4E79] text-white'
                                : 'border-gray-300 bg-white text-gray-600 hover:border-[#1F4E79]'
                            }`}
                          >
                            {mm.date || '날짜 미상'}
                            {aiByMeeting[mm.id] ? ' ✓' : ''}
                          </button>
                        ))}
                      </div>
                    </div>

                    {activeMeeting && (
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-[#1F4E79]/5 border border-[#1F4E79]/20 px-4 py-2 flex-wrap">
                        <span className="text-sm font-semibold text-[#1F4E79]">
                          선택한 회의: {activeMeeting.date}
                          {activeMeeting.year ? ` (${activeMeeting.year}년)` : ''}
                        </span>
                        <a
                          href={kmsUrl(activeMeeting.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#1F4E79] underline print:hidden"
                        >
                          회의록 원문 보기 ↗
                        </a>
                      </div>
                    )}

                    {/* 4단 정리표 */}
                    <div>
                      <div className="flex items-baseline justify-between mb-2">
                        <h3 className="text-lg font-bold text-gray-900 border-l-4 border-[#1F4E79] pl-3">
                          발언 정리표 (주제·의원 발언·실국장 답변·조치사항)
                        </h3>
                        <span className="text-xs text-gray-400 print:hidden">
                          {aiBusy != null
                            ? 'AI가 표로 정리하는 중…'
                            : usingAi
                              ? 'AI 정리'
                              : '자동(규칙기반) — 회의를 선택하면 AI가 주제별로 정리합니다'}
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
                            {visibleRows.map((r, i) => (
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
                      {visibleStmts.map(({ stmt, meeting }) => (
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
