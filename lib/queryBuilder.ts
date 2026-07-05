import type { Meeting, Issue } from '@/lib/types';

// ─── Tone definitions ────────────────────────────────────────────────────────

export type ToneKey = 'soft' | 'firm' | 'sharp';

type ToneRecord = {
  open: string;
  greet: string;
  pose: string;
  pushBefore: string;
  cite: string;
  demand: string;
  close: string;
};

export const Q_TONES: Record<ToneKey, ToneRecord> = {
  soft: {
    open: '존경하는',
    greet: '먼저 평소 도민의 안전과 행정 효율을 위해 헌신해 오신 노고에 감사드립니다.',
    pose: '본 위원이 한 가지 여쭙고자 합니다.',
    pushBefore: '조심스럽게 다음 사항에 대해 답변을 요청드립니다.',
    cite: '관련 자료에 따르면',
    demand: '향후 개선 방향에 대해 의견을 들어보고 싶습니다.',
    close: '성의 있는 답변 부탁드립니다.',
  },
  firm: {
    open: '존경하는',
    greet: '먼저 도민의 안전과 행정 책무를 짊어지신 노고에 격려의 말씀을 드립니다.',
    pose: '본 위원은 다음 사항에 대해 명확한 답변을 요구합니다.',
    pushBefore: '본 위원이 지적하는 문제는 명백하며, 이에 대한 책임 있는 답변이 필요합니다.',
    cite: '확인된 사실에 따르면',
    demand: '시정 조치 계획과 책임 소재를 분명하게 밝혀주시기 바랍니다.',
    close: '본 위원은 답변 내용에 따라 추가 조치를 검토할 것입니다.',
  },
  sharp: {
    open: '',
    greet: '',
    pose: '본 위원은 묻겠습니다.',
    pushBefore: '이는 단순한 행정 미흡이 아니라 중대한 책임의 문제입니다.',
    cite: '이미 공식 자료로 확인된 사실은',
    demand: '책임자의 즉각적인 답변과 후속 책임을 분명히 하시기 바랍니다. 회피성 답변은 더 큰 의혹을 불러올 뿐입니다.',
    close: '본 위원은 본 사안을 끝까지 추적할 것이며, 미흡한 답변에 대해서는 추가 자료요구·증인 출석을 통해 책임을 묻겠습니다.',
  },
};

// ─── Type seed definitions ────────────────────────────────────────────────────

export type QtypeKey =
  | 'policy'
  | 'budget'
  | 'safety'
  | 'personnel'
  | 'performance'
  | 'response'
  | 'contract'
  | 'general';

export const Q_TYPE_SEED: Record<QtypeKey, string[]> = {
  policy: [
    '정책의 목표와 실제 성과 사이의 괴리',
    '추진 체계의 모호함과 부서 간 책임 소재',
    '도민 의견 수렴 절차의 형식화',
    '유사 사업과의 중복 투자 우려',
    '성과 지표의 자의적 운영',
    '예산 대비 효과성 입증 부족',
    '사후 평가·환류 시스템 부재',
  ],
  budget: [
    '예산 배정액 대비 집행률 저조',
    '용도 외 사용·전용 의혹',
    '연말 몰아쓰기·집중 집행',
    '계약 단가의 시장 가격 대비 적정성',
    '예비비·이월액 처리 절차',
    '예산서 산출 근거의 불명확성',
    '집행 잔액 처리·반납 절차의 투명성',
  ],
  safety: [
    '안전 점검 주기·실효성',
    '재난 발생 시 초동 대응 매뉴얼 미흡',
    '관계기관 협력체계의 형식적 운영',
    '취약시설·취약계층 보호 사각지대',
    '안전요원·인력 배치 적정성',
    '훈련 빈도·내용의 형식화',
    '사고 발생 후 책임 규명·재발 방지 대책 미수립',
  ],
  personnel: [
    '인사 운영의 공정성·투명성',
    '결원·정원 미충원에 따른 업무 과중',
    '직무교육의 형식적 운영',
    '비위·민원 발생 시 처분 일관성',
    '성과평가 제도의 객관성',
    '조직 개편의 합목적성',
    '복무 관리·근태 점검의 실효성',
  ],
  performance: [
    '핵심 성과지표(KPI) 미달',
    '수혜자·도민 만족도 하락',
    '사업 추진 일정 지연',
    '기대 효과 대비 실제 성과 부족',
    '경쟁 지자체 대비 성과 격차',
    '사후 모니터링·환류 부재',
    '사업 종료 후 지속가능성 미확보',
  ],
  response: [
    '민원 처리 기한 미준수',
    '도민 제보·신고에 대한 회신 부족',
    '동일 민원 반복 발생에 대한 근본 대책 부재',
    '담당자 변경 시 인수인계 미흡',
    '민원 응대 태도·매뉴얼 미정비',
    '온라인·오프라인 창구 일관성 부족',
    '민원 통계 관리·공개 미흡',
  ],
  contract: [
    '수의계약 비중 과다·근거 부족',
    '입찰 공고 절차의 형식화',
    '계약 변경·증액 사유의 적정성',
    '특정 업체 편중 의혹',
    '용역 결과물 검수 절차',
    '하도급 관리·이행 점검 미흡',
    '계약 이행 평가 결과의 환류',
  ],
  general: [
    '사무 처리 절차의 적정성',
    '관련 법령·조례 준수 여부',
    '결재·문서 관리 체계',
    '관계 기관 협조 체계',
    '내부 통제·감사 체계',
    '정보 공개·도민 알권리 보장',
    '업무 보고의 정확성·적시성',
  ],
};

// ─── Length definitions ───────────────────────────────────────────────────────

export type LengthKey = 'short' | 'medium' | 'long';

type LengthDetail = {
  sentencesPerItem: number;
  intro: 'compact' | 'normal' | 'expanded';
  outro: 'compact' | 'normal' | 'expanded';
  useFacts: boolean;
  useContext: boolean;
};

export const Q_LENGTH_DETAIL: Record<LengthKey, LengthDetail> = {
  short: { sentencesPerItem: 1, intro: 'compact', outro: 'compact', useFacts: false, useContext: false },
  medium: { sentencesPerItem: 2, intro: 'normal', outro: 'normal', useFacts: true, useContext: true },
  long: { sentencesPerItem: 3, intro: 'expanded', outro: 'expanded', useFacts: true, useContext: true },
};

// ─── QueryParams type ─────────────────────────────────────────────────────────

export type FmtKey = 'oral' | 'written' | 'speech';
export type EngineKey = 'rule' | 'gemini' | 'claude' | 'openai';

export type QueryParams = {
  comm: string;
  dept: string;
  targetTitle: string;
  member: string;
  session: string;
  budget: string;
  topic: string;
  keywords: string;
  facts: string;
  context: string;
  qtype: QtypeKey;
  tone: ToneKey;
  length: LengthKey;
  fmt: FmtKey;
  itemCount: number;
  citeCount: number;
  /** 연계할 기존 지적사항 (후속 점검·재발 여부 추궁용) */
  pastIssues?: Issue[];
};

// ─── Past-issue history builder ───────────────────────────────────────────────

/**
 * 선택된 기존 지적사항을 후속 질의에 활용할 수 있도록 사람이 읽기 좋은
 * 한 줄 요약 목록으로 변환한다. 미처리/처리중 건은 [미시정] 태그를 붙여
 * 추궁 강도를 높일 수 있도록 한다.
 */
export function qBuildIssueHistory(issues: Issue[] | undefined): string[] {
  if (!issues || issues.length === 0) return [];
  return issues.map((it) => {
    const unresolved = it.proc !== '처리완료';
    const flag = unresolved ? '[미시정] ' : '[시정완료] ';
    const dateStr = it.date ? `${it.date} ` : '';
    const deptStr = it.dept ? `${it.dept} · ` : '';
    const action = it.action ? ` → 조치요구: ${it.action}` : '';
    return `${flag}${dateStr}${deptStr}(${it.type}) ${it.content}${action}`;
  });
}

// ─── Citation builder ─────────────────────────────────────────────────────────

export function qBuildCitations(comm: string, count: number, meetings: Meeting[]): string[] {
  if (!count) return [];
  const related = meetings
    .filter((m) => m.committee === comm)
    .sort((a, b) => b.year - a.year || b.date.localeCompare(a.date))
    .slice(0, count);
  return related.map(
    (m) => `「${m.year}년도 ${comm} 행정사무감사 회의록(${m.date})」 mntsId=${m.id}`
  );
}

// ─── Rule-based query builder ─────────────────────────────────────────────────

export function buildRuleQuery(params: QueryParams, meetings: Meeting[]): string {
  const comm = params.comm || '해당 위원회';
  const dept = params.dept || '해당 부서';
  const targetTitle = params.targetTitle || '실장';
  const topic = params.topic || '본 사안';
  const itemCount = params.itemCount || 5;
  const citeCount = params.citeCount || 0;
  const { tone, length, fmt, qtype, budget, keywords, facts, context, session, member } = params;

  const T = Q_TONES[tone] ?? Q_TONES['firm'];
  const D = Q_LENGTH_DETAIL[length] ?? Q_LENGTH_DETAIL['medium'];

  // Seeds
  const seedSource: string[] = (Q_TYPE_SEED[qtype] ?? []).slice(0, itemCount);
  const seeds: string[] = [...seedSource];
  while (seeds.length < itemCount) seeds.push('관련 사무 운영의 전반적 적정성');

  // Member parsing
  let memberName = '본 위원';
  let memberRole = '';
  let memberDistrict = '';
  let memberParty = '';
  if (member) {
    const parts = member.split('|');
    memberName = (parts[0] ?? '') + ' 의원';
    memberRole = parts[1] ?? '';
    memberDistrict = parts[2] ?? '';
    memberParty = parts[3] ?? '';
  }

  const dateStr = new Date().toLocaleDateString('ko-KR');
  const citations = qBuildCitations(comm, citeCount, meetings);

  // Format header
  const formatHeaderMap: Record<FmtKey, string> = {
    oral: '【행정사무감사 현장 질의서】',
    written: '【서면 질의서】',
    speech: '【5분 자유발언 원고】',
  };
  const formatHeader = formatHeaderMap[fmt] ?? formatHeaderMap['oral'];

  const rule44 = '━'.repeat(44);
  const rule41 = '─'.repeat(41);

  let out = '';

  // Header block
  out += formatHeader + '\n';
  out += rule44 + '\n';
  out += `위    원    회 : ${comm}\n`;
  out += `피  감  기  관 : ${dept}\n`;
  out += `답  변  자 : ${targetTitle}\n`;
  out += `질  의  의  원 : ${memberName}${memberDistrict ? ` (${memberParty}, ${memberDistrict})` : ''}\n`;
  if (session) out += `회 기 · 일 자 : ${session}\n`;
  out += `작 성 일 자 : ${dateStr}\n`;
  out += rule44 + '\n\n';

  // Intro
  if (T.greet) {
    out += `${T.open} ${targetTitle}님, 그리고 ${dept} 관계자 여러분.\n`;
    out += `${memberName}입니다.\n\n`;
    out += `${T.greet}\n\n`;
  } else {
    // sharp
    out += `${memberName}입니다.\n\n`;
  }

  // Topic
  out += `오늘 본 위원이 질의드릴 사항은 「${topic}」에 관한 것입니다.\n`;
  if (budget) {
    out += `이 사안은 연간 ${budget}이 투입되는 사업이자, 도민의 ${qtype === 'safety' ? '생명과 안전' : '삶의 질'}에 직결되는 중대한 행정 사무입니다.\n\n`;
  } else {
    out += `이 사안은 도민의 ${qtype === 'safety' ? '생명과 안전' : '삶의 질'}에 직결되는 중대한 행정 사무입니다.\n\n`;
  }

  // Past-issue history + section numbering via running counter
  const issueHistory = qBuildIssueHistory(params.pastIssues);
  const hasFacts = D.useFacts && (facts || context);
  let sectionNo = 0;
  const factsSection = hasFacts ? ++sectionNo : 0;
  const issueSection = ++sectionNo;
  const histSection = issueHistory.length ? ++sectionNo : 0;
  const citeSection = citations.length ? ++sectionNo : 0;
  const demandSection = ++sectionNo;

  // Facts section
  if (hasFacts) {
    out += `【 ${factsSection}. 사실관계 적시 】\n`;
    out += rule41 + '\n';
    out += `${T.cite} 다음과 같은 사실이 확인되었습니다.\n\n`;
    if (facts) {
      facts.split(/[,\n]/).forEach((f) => {
        if (f.trim()) out += `  ○ ${f.trim()}\n`;
      });
      out += '\n';
    }
    if (context && D.intro !== 'compact') {
      out += `또한 사전 조사 과정에서 다음과 같은 사항이 확인되었습니다.\n`;
      out += `  ${context.replace(/\n+/g, '\n  ')}\n\n`;
    }
    out += `${T.pushBefore}\n\n`;
  }

  // Issues section
  out += `【 ${issueSection}. 본 위원이 지적하는 문제점 】\n`;
  out += rule41 + '\n';

  const ordinals = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째'];
  const keywordsArr = keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  seeds.forEach((seed, i) => {
    const kw = keywordsArr[i % Math.max(keywordsArr.length, 1)] || topic;
    out += `\n${ordinals[i]}, ${seed}에 관한 문제입니다.\n`;
    out += `  ${dept}의 「${topic}」 추진에 있어, 「${kw}」 영역에서 ${seed}이(가) 명백하게 드러나고 있습니다.\n`;
    if (D.sentencesPerItem >= 2) {
      const probes = [
        '이에 대한 사실 여부와 그 발생 원인',
        '담당 부서의 인지 시점과 보고 체계',
        '시정 조치의 구체적 시기와 책임자',
      ];
      const probe = probes[i % 3];
      out += `  ▷ ${probe}을(를) 명확히 답변해 주시기 바랍니다.\n`;
    }
    if (D.sentencesPerItem >= 3) {
      out += `  ▷ 동일 사안이 이미 ${memberRole === '위원장' ? '본 위원회' : '본 위원'}에 의해 지적된 바 있다면, 그동안 어떠한 후속 조치가 이루어졌는지 자료와 함께 답변해 주십시오.\n`;
    }
  });
  out += '\n';

  // Citations section
  if (citations.length) {
    out += `\n【 ${citeSection}. 참고 회의록 · 근거 자료 】\n`;
    out += rule41 + '\n';
    citations.forEach((c) => (out += `  ▸ ${c}\n`));
    out += `\n위 회의록은 본 질의의 사실관계 근거이며, 이미 공식 기록으로 등재되어 있습니다.\n`;
    out += `이전 지적사항에 대한 ${dept}의 시정 이력을 함께 답변해 주시기 바랍니다.\n\n`;
  }

  // Past-issue follow-up section
  if (issueHistory.length) {
    const unresolvedCount = (params.pastIssues ?? []).filter((it) => it.proc !== '처리완료').length;
    out += `\n【 ${histSection}. 기존 지적사항 후속 점검 】\n`;
    out += rule41 + '\n';
    out += `본 위원회가 ${dept}에 대해 이미 지적한 다음 사항의 시정 여부를 확인하고자 합니다.\n\n`;
    issueHistory.forEach((h) => (out += `  ▸ ${h}\n`));
    out += '\n';
    if (unresolvedCount > 0) {
      out += `특히 위 ${unresolvedCount}건은 아직 시정이 완료되지 않은 사안입니다. ${T.cite} 반복·미시정 사유와 책임 소재, 그리고 구체적 시정 일정을 명확히 답변해 주시기 바랍니다.\n\n`;
    } else {
      out += `위 지적사항의 시정 조치가 형식적 이행에 그치지 않았는지, 그 실효성과 사후 점검 결과를 함께 답변해 주시기 바랍니다.\n\n`;
    }
  }

  // Demands section
  const dueDateStr = new Date(Date.now() + 30 * 86400000).toLocaleDateString('ko-KR');
  out += `\n【 ${demandSection}. 본 위원이 요구하는 사항 】\n`;
  out += rule41 + '\n';
  out += `  가. 위 지적사항 전반에 대한 ${targetTitle}의 명시적 답변\n`;
  out += `  나. 시정 조치 계획 및 책임 소재에 관한 서면 보고 (회기 종료일까지)\n`;
  out += `  다. 재발 방지 대책 및 ${qtype === 'budget' ? '예산 집행 정상화' : '사업 정상화'} 로드맵 제출 (${dueDateStr}까지)\n`;
  if (D.outro !== 'compact') {
    out += `  라. 관련 부서·기관 협의 결과 및 도민 의견 수렴 절차 공개\n`;
    out += `  마. 차기 회기 시 후속 조치 이행 결과 보고\n`;
  }

  // Closing
  out += `\n`;
  out += rule44 + `\n`;
  out += `${T.demand}\n\n`;
  out += `${T.close}\n\n`;
  out += `이상으로 ${memberName}의 질의를 마치겠습니다.\n`;
  out += `\n${dateStr}\n경기도의회 ${comm} ${memberName}\n`;

  return out;
}

// ─── LLM prompt builder ───────────────────────────────────────────────────────

/**
 * LLM 엔진에 system 역할로 전달할 페르소나·품질 지침. user 프롬프트(컨텍스트)와
 * 분리하여 모델이 역할과 출력 규칙을 안정적으로 따르도록 한다.
 */
export const QUERY_SYSTEM_PROMPT = `당신은 대한민국 광역의회(경기도의회)의 베테랑 정책지원관입니다. 행정사무감사에서 의원이 곧바로 낭독·제출할 수 있는 완성도 높은 질의서를 작성합니다.

[전문성]
- 지방자치법·지방재정법·행정사무감사 및 조사에 관한 조례 등 관련 법령 체계를 숙지하고 있습니다.
- 막연한 비판이 아니라 "사실 → 문제점 → 답변 요구"의 3단 논리로 압박하며, 수치·근거가 주어지면 반드시 인용합니다.
- 피감기관이 회피할 수 없도록 질문을 구체적이고 폐쇄형(예/아니오, 일자, 수치 확인)으로 설계합니다.

[금지]
- 사실에 없는 수치·법조문·사건을 지어내지 않습니다. 주어진 사실관계 범위 내에서만 단정하고, 불확실한 부분은 "확인이 필요하다"는 형태의 답변 요구로 전환합니다.
- 마크다운 기호(#, *, -, \`\`\`)를 쓰지 않습니다. 불릿은 ○ ▷ ▸, 항목 번호는 첫째/둘째, 요구사항은 가/나/다를 사용합니다.
- 영어·메타설명·따옴표로 감싼 안내문을 출력하지 않습니다. 오직 질의서 본문만 출력합니다.

[품질 기준]
- 도입 → (사실관계) → 지적사항 → (기존 지적 후속점검) → (참고 회의록) → 요구사항 → 마무리 서명의 흐름을 지킵니다.
- 분량·톤·형식 지침을 반드시 준수합니다.`;

export function buildLLMPrompt(params: QueryParams, meetings: Meeting[]): string {
  const comm = params.comm || '해당 위원회';
  const dept = params.dept || '해당 부서';
  const tgt = params.targetTitle || '실장';
  const topic = params.topic || '본 사안';
  const itemCount = params.itemCount || 5;
  const { tone, length, fmt, qtype, budget, keywords, facts, context, session, member } = params;
  const citeCount = params.citeCount || 0;

  const toneDescMap: Record<ToneKey, string> = {
    soft: '완곡하고 협조 요청형',
    firm: '단호하고 책임 확인형',
    sharp: '날카롭고 책임 추궁형. 인사말 없이 본론으로 직진',
  };
  const lengthDescMap: Record<LengthKey, string> = {
    short: '600자 내외 짧게',
    medium: '1500자 내외 중간 길이',
    long: '3000자 이상 매우 상세하게',
  };
  const formatDescMap: Record<FmtKey, string> = {
    oral: '현장 구두 질의 (일문일답)',
    written: '서면 질의서',
    speech: '5분 자유발언 원고',
  };

  const toneDesc = toneDescMap[tone] ?? toneDescMap['firm'];
  const lengthDesc = lengthDescMap[length] ?? lengthDescMap['medium'];
  const formatDesc = formatDescMap[fmt] ?? formatDescMap['oral'];

  let memberDesc = '의원';
  if (member) {
    const parts = member.split('|');
    const n = parts[0] ?? '';
    const r = parts[1] ?? '';
    const d = parts[2] ?? '';
    const party = parts[3] ?? '';
    memberDesc = `${n} 의원 (${r}, ${d}, ${party})`;
  }

  const citations = qBuildCitations(comm, citeCount, meetings);
  const issueHistory = qBuildIssueHistory(params.pastIssues);

  return `경기도의회 행정사무감사에서 사용할 ${formatDesc} 원고를 작성하세요.

# 컨텍스트
- 위원회: ${comm}
- 피감기관/부서: ${dept}
- 답변자 직위: ${tgt}
- 질의 의원: ${memberDesc}
- 회기/일자: ${session}
- 관련 예산: ${budget}
- 질의 유형: ${qtype}
- 톤: ${toneDesc}
- 분량: ${lengthDesc}
- 지적사항 항목 수: ${itemCount}개

# 핵심 주제
${topic}

# 키워드
${keywords}

# 사실관계 (수치·구체적 사실)
${facts || '(없음)'}

# 사전 조사 메모
${context || '(없음)'}

# 참고 회의록 인용 (반드시 본문에 자연스럽게 포함)
${citations.length ? citations.map((c) => '- ' + c).join('\n') : '(없음)'}

# 기존 지적사항 이력 (후속 점검·재발 여부 추궁에 활용)
${issueHistory.length ? issueHistory.map((h) => '- ' + h).join('\n') : '(없음)'}

# 작성 지침
1. 한국 의회 행정사무감사 어조 — 정중하지만 단호. 단, 톤이 "날카로움"이면 인사말 없이 본론으로 직진하고 책임 추궁 강도를 높여라.
2. 구조: 도입 → 사실관계 → 지적사항 ${itemCount}개 (첫째/둘째/.../일곱째 식) → ${issueHistory.length ? '기존 지적사항 후속 점검 → ' : ''}참고 회의록 → 요구사항(가/나/다) → 마무리.
3. 각 지적사항은 단순 질문이 아니라 사실 → 문제 → 답변 요구 3단 구조로 작성하라. 답변 요구는 일자·수치·예/아니오로 답할 수 있는 폐쇄형으로 설계하라.
4. 회의록 ID(mntsId)는 인용할 때 그대로 포함.
5. 기존 지적사항 이력이 제공된 경우, [미시정] 표시된 건은 반복·미시정 사유와 시정 일정을 반드시 추궁하고, 형식적 이행 여부를 점검하는 별도 항목을 구성하라.
6. 마지막에 의원명·일자 서명 형식 포함.
7. 한국어로만 작성. 마크다운 기호 사용 금지(불릿은 ○·▷·가/나/다 사용).
8. 분량 지침을 반드시 준수하라.

질의서 본문만 출력. 다른 설명이나 메타 텍스트 금지.`;
}
