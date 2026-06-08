// 회의록 본문 → 발언자별 발언 묶기 + 규칙기반 요약
// 한국 지방의회 회의록은 발언 시작을 '○' 마커로 표기하는 관례를 따른다.
// 예) "○홍길동 위원  ... 발언 ...", "○위원장 김철수  ...", "○○○ 국장  ..."

export type Turn = {
  speaker: string; // 발언자 이름(또는 라벨)
  role: string; // 직책: 위원장/부위원장/위원/의장/공무원/기타
  text: string; // 발언 본문
  isMember: boolean; // 의원(위원장/부위원장/위원/의원) 여부
};

export type SpeakerGroup = {
  speaker: string;
  role: string;
  isMember: boolean;
  text: string; // 발언 전체(이어붙임)
  turns: number; // 발언 횟수
  chars: number; // 글자 수
  ruleSummary: string; // 규칙기반 요약
};

const MEMBER_ROLES = new Set(['위원장', '부위원장', '위원', '의원', '의장', '부의장']);

// "이름 + 직책" (예: 홍길동 위원)
const ROLE_AFTER = /^\s*([가-힣]{2,5})\s*(위원장|부위원장|위원|의원|의장|부의장)(?![가-힣])/;
// "직책 + 이름" (예: 위원장 홍길동)
const ROLE_BEFORE = /^\s*(위원장|부위원장|의장|부의장)\s+([가-힣]{2,5})(?![가-힣])/;
// 공무원 직책 (예: 홍길동 국장, ○○○ 안전관리관)
const OFFICIAL = /^\s*([가-힣]{2,5})\s*([가-힣]{0,6}(?:지사|교육감|실장|국장|과장|본부장|단장|소장|부장|팀장|관|위원회위원장))(?![가-힣])/;

function stripLead(s: string): string {
  return s.replace(/^[\s:：.\-·)\]]+/, '').trim();
}

// 본문을 발언 단위(turn)로 분해
export function parseTurns(raw: string): Turn[] {
  if (!raw) return [];
  // 줄바꿈 정리 후 '○' 기준 분할 (마커 보존)
  const text = raw.replace(/\r\n/g, '\n');
  // '○' 또는 'O'(오인식) 라인 시작 마커를 분할 경계로
  const chunks = text
    .split(/(?:^|\n)\s*[○◯]/)
    .map((c) => c.trim())
    .filter(Boolean);

  const turns: Turn[] = [];
  for (const chunk of chunks) {
    let m = ROLE_BEFORE.exec(chunk);
    if (m) {
      turns.push({
        speaker: m[2],
        role: m[1],
        text: stripLead(chunk.slice(m[0].length)),
        isMember: true,
      });
      continue;
    }
    m = ROLE_AFTER.exec(chunk);
    if (m) {
      turns.push({
        speaker: m[1],
        role: m[2],
        text: stripLead(chunk.slice(m[0].length)),
        isMember: MEMBER_ROLES.has(m[2]),
      });
      continue;
    }
    m = OFFICIAL.exec(chunk);
    if (m) {
      turns.push({
        speaker: m[1],
        role: m[2],
        text: stripLead(chunk.slice(m[0].length)),
        isMember: false,
      });
      continue;
    }
    // 라벨 인식 실패: 앞 15자 이내에서 한글 라벨만 추출 시도
    const fb = /^\s*([가-힣]{2,6})\b/.exec(chunk);
    if (fb) {
      turns.push({
        speaker: fb[1],
        role: '기타',
        text: stripLead(chunk.slice(fb[0].length)),
        isMember: false,
      });
    }
  }
  return turns;
}

// 발언자별로 묶기
export function groupBySpeaker(turns: Turn[]): SpeakerGroup[] {
  const map = new Map<string, SpeakerGroup>();
  for (const t of turns) {
    if (!t.text) continue;
    const key = `${t.speaker}|${t.role}`;
    const g = map.get(key);
    if (g) {
      g.text += '\n' + t.text;
      g.turns += 1;
    } else {
      map.set(key, {
        speaker: t.speaker,
        role: t.role,
        isMember: t.isMember,
        text: t.text,
        turns: 1,
        ruleSummary: '',
        chars: 0,
      });
    }
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.chars = g.text.replace(/\s/g, '').length;
    g.ruleSummary = ruleSummary(g.text);
  }
  // 의원 먼저, 발언량 많은 순
  groups.sort((a, b) => {
    if (a.isMember !== b.isMember) return a.isMember ? -1 : 1;
    return b.chars - a.chars;
  });
  return groups;
}

// 규칙기반 요약: 앞 핵심 문장 + 길이 정보
export function ruleSummary(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  // 한국어 문장 분리(…다. …요. …까? 등)
  const sentences = clean
    .split(/(?<=[.?!])\s+|(?<=[다요죠음함])\.\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  const picked: string[] = [];
  let len = 0;
  for (const s of sentences) {
    picked.push(s);
    len += s.length;
    if (picked.length >= 3 || len >= 160) break;
  }
  let summary = picked.join(' ');
  if (summary.length > 200) summary = summary.slice(0, 200) + '…';
  return summary;
}

// AI 요약 프롬프트 구성
export function buildAiPrompt(groups: SpeakerGroup[]): string {
  const blocks = groups
    .map((g) => {
      // 너무 길면 잘라 토큰 절약
      const body = g.text.length > 1500 ? g.text.slice(0, 1500) + '…' : g.text;
      return `[${g.speaker} ${g.role}]\n${body}`;
    })
    .join('\n\n');
  return (
    '다음은 한 회의록에서 발언자별로 모은 발언 내용입니다.\n' +
    '각 발언자별로 핵심 주장과 질의 요지를 2~3문장으로 간결하게 요약해 주세요.\n' +
    '반드시 아래 형식의 JSON 배열로만 답하세요(설명 문장 금지):\n' +
    '[{"speaker":"이름","summary":"요약문"}]\n\n' +
    '=== 발언 목록 ===\n' +
    blocks
  );
}

// AI 응답(JSON) 파싱: speaker→summary 매핑
export function parseAiSummaries(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text) return out;
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) return out;
    const arr = JSON.parse(text.slice(start, end + 1)) as Array<{
      speaker?: string;
      summary?: string;
    }>;
    for (const item of arr) {
      if (item?.speaker && item?.summary) out[item.speaker.trim()] = item.summary.trim();
    }
  } catch {
    // 무시 — 규칙기반으로 폴백
  }
  return out;
}
