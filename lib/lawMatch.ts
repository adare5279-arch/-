// 지적사항·이상항목 텍스트에서 관련 근거법령 조문을 추천한다.
// lib/laws.ts 의 하드코딩 원문(지방자치법 감사 조문 + 경기도의회 조례)을 근거로
// 키워드 규칙을 매칭하며, DB 스키마 변경 없이 파생(연계) 정보만 계산한다.
import { LAWS } from './laws';

export type LawMatch = {
  lawId: string;
  lawName: string;
  heading: string; // 전체 제목 (예: "제50조(행정사무 감사 또는 조사 보고의 처리)")
  anchor: string;  // 조 번호 (예: "제50조") — 법령 페이지 딥링크용
  sourceUrl: string;
  reason: string;
};

type Rule = {
  keywords: RegExp;
  refs: Array<{ lawId: string; heading: string; reason: string }>;
};

// 우선순위 순서대로 평가하며, 같은 조문은 한 번만 추천한다.
const RULES: Rule[] = [
  {
    // 모든 지적사항은 감사 결과 시정요구·처리·보고 절차의 적용을 받는다.
    keywords: /시정|개선|요구|조치|처리|보고|이송|권고|미흡|부적정|부당/,
    refs: [
      {
        lawId: 'local-autonomy-act',
        heading: '제50조',
        reason: '감사 결과 시정요구·이송 및 지체 없는 처리·보고 의무의 직접 근거',
      },
    ],
  },
  {
    keywords: /자료|서류|제출|미제출|미비|누락|제공|보고서/,
    refs: [
      {
        lawId: 'local-autonomy-act',
        heading: '제48조',
        reason: '안건 심의와 관련된 서류제출 요구권',
      },
      {
        lawId: 'local-autonomy-act',
        heading: '제49조',
        reason: '감사·조사를 위한 서류제출 요구 및 정당한 사유 없는 미제출 시 과태료',
      },
      {
        lawId: 'ggc-audit-ordinance',
        heading: '제12조',
        reason: '감사·조사 방법(현지확인·서류제출·출석 요구) 및 협조 의무',
      },
    ],
  },
  {
    keywords: /증인|참고인|출석|증언|선서|거짓|위증|불출석|진술/,
    refs: [
      {
        lawId: 'local-autonomy-act',
        heading: '제49조',
        reason: '증인 출석·증언 요구 및 불출석·거짓증언 시 과태료·고발',
      },
      {
        lawId: 'ggc-audit-ordinance',
        heading: '제13조',
        reason: '증인 신문사항의 범위·한계',
      },
    ],
  },
  {
    keywords: /과태료|고발|벌칙|제재/,
    refs: [
      {
        lawId: 'local-autonomy-act',
        heading: '제49조',
        reason: '서류 미제출·불출석·거짓증언에 대한 과태료 부과 근거',
      },
    ],
  },
];

export function matchLaws(text: string): LawMatch[] {
  const hay = text ?? '';
  if (!hay.trim()) return [];
  const seen = new Set<string>();
  const out: LawMatch[] = [];
  for (const rule of RULES) {
    if (!rule.keywords.test(hay)) continue;
    for (const ref of rule.refs) {
      const key = `${ref.lawId}|${ref.heading}`;
      if (seen.has(key)) continue;
      const doc = LAWS.find((l) => l.id === ref.lawId);
      if (!doc) continue;
      const art = doc.articles.find((a) => a.heading.startsWith(ref.heading));
      if (!art) continue;
      seen.add(key);
      out.push({
        lawId: ref.lawId,
        lawName: doc.name,
        heading: art.heading,
        anchor: art.heading.split('(')[0],
        sourceUrl: doc.sourceUrl,
        reason: ref.reason,
      });
    }
  }
  return out;
}

// 법령 페이지 딥링크 (?law=&jo=) — 해당 조문으로 이동·강조
export function lawHref(m: LawMatch): string {
  return `/laws?law=${encodeURIComponent(m.lawId)}&jo=${encodeURIComponent(m.anchor)}`;
}
