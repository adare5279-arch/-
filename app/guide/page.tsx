'use client';

import Link from 'next/link';
import { useState } from 'react';

type Feature = { href: string; name: string; desc: string };
type Group = { title: string; menu: string; color: string; items: Feature[] };

const GROUPS: Group[] = [
  {
    title: '종합 현황',
    menu: '상단 메뉴 「종합 현황」',
    color: '#1F4E79',
    items: [
      {
        href: '/',
        name: '대시보드',
        desc: '감사 진행 상황을 한 화면에 모아 보여줍니다. 미제출 자료·기한 임박·미처리 지적처럼 지금 바로 챙겨야 할 일이 위로 올라옵니다. 프로그램을 켜면 가장 먼저 여기를 보세요.',
      },
      {
        href: '/calendar',
        name: '감사 일정',
        desc: '감사일·회의일·자료 마감일을 달력으로 보여줍니다. 7일 안에 마감인 미제출 자료를 알려주어 놓치지 않게 합니다. 직접 일정을 추가할 수도 있습니다.',
      },
      {
        href: '/stats',
        name: '활동 통계',
        desc: '의원별·부서별로 자료를 얼마나 요구하고 받았는지 표로 정리합니다. 그대로 엑셀로 내려받아 보고에 쓸 수 있습니다.',
      },
    ],
  },
  {
    title: '자료 · 부서',
    menu: '상단 메뉴 「자료 · 부서」',
    color: '#2E7D32',
    items: [
      {
        href: '/docs',
        name: '자료요구',
        desc: '부서에 요청하는 자료의 제목·마감일·제출 상태를 관리합니다. 엑셀로 한꺼번에 등록하거나 받은 파일을 첨부할 수 있습니다.',
      },
      {
        href: '/dept',
        name: '소관부서',
        desc: '감사 대상 부서 목록을 관리하고 부서 홈페이지 링크를 보관합니다. 자료요구·지적사항을 부서와 연결하는 기준이 됩니다.',
      },
      {
        href: '/members',
        name: '의원명부',
        desc: '위원장·부위원장·위원 등 위원회 의원 정보를 카드와 표로 봅니다. 경기도의회 공식 페이지로 바로 이동할 수 있습니다.',
      },
      {
        href: '/statements',
        name: '의원별 발언',
        desc: '의원을 고르면 회의 날짜별로 발언이 정리됩니다. 날짜를 선택하면 주제·의원 발언·실국장 답변·조치사항 4단 표로 보이고, 한글·PDF로 내려받을 수 있습니다. (AI 키를 넣으면 자동 요약)',
      },
      {
        href: '/meetings',
        name: '회의록',
        desc: '경기도의회 회의록 원문을 보고, 음성·문서 회의록을 올리면 AI가 의원별 발언으로 자동 정리해 줍니다.',
      },
      {
        href: '/press',
        name: '보도자료',
        desc: '의원 보도자료를 주제나 이름으로 검색해 최신 소식을 확인합니다.',
      },
      {
        href: '/archive',
        name: '자료 정리(ZIP)',
        desc: '위원회의 자료요구·지적사항·증인·회의록을 부서별 폴더로 묶어 ZIP 한 개로 내려받습니다. 자료 백업·인계에 편리합니다.',
      },
    ],
  },
  {
    title: '감사 진행',
    menu: '상단 메뉴 「감사 진행」',
    color: '#B45309',
    items: [
      {
        href: '/issues',
        name: '지적사항',
        desc: '감사에서 찾아낸 위법·부당·개선 사항을 등록·분류합니다. 파일 첨부, 처리 상태 추적, 근거법령 연결이 됩니다.',
      },
      {
        href: '/witnesses',
        name: '증인·참고인',
        desc: '증인·참고인의 출석 예정/완료/불출석 현황과 연락처·소속을 기록합니다.',
      },
      {
        href: '/report',
        name: '결과보고서',
        desc: '감사 개요·총평·시정요구·건의·정책제언 등 7개 항목으로 결과보고서를 작성합니다. 등록해 둔 지적사항·증인 자료가 자동으로 들어갑니다.',
      },
      {
        href: '/laws',
        name: '근거법령',
        desc: '지방자치법·지방재정법 등 감사 관련 법령 조문을 검색하고, 지적사항의 근거로 연결합니다.',
      },
    ],
  },
  {
    title: '예산 · 결산',
    menu: '상단 메뉴 「예산 · 결산」',
    color: '#6D28D9',
    items: [
      {
        href: '/budget',
        name: '예산 자료',
        desc: '예산·결산 자료를 사업별로 등록합니다. 엑셀·한글·PDF를 올리면 사업명·예산액을 자동으로 뽑아 줍니다.',
      },
      {
        href: '/settlement',
        name: '결산자료',
        desc: '집행액·이월액을 입력하면 집행률·불용액이 자동 계산되고, 전체 합계 현황이 정리됩니다.',
      },
      {
        href: '/analysis',
        name: '분석자료',
        desc: '집행 저조·초과·불용 과다 같은 이상 항목을 자동으로 찾아내고, 이를 지적사항이나 자료요구 초안으로 바로 등록할 수 있습니다.',
      },
      {
        href: '/fiscal',
        name: '재정지표',
        desc: '재정자립도·재정자주도·채무비율 등 재정 지표를 연도별로 입력·관리하고 추세를 비교합니다.',
      },
    ],
  },
  {
    title: 'AI 도우미',
    menu: '상단 메뉴 「AI 도우미」',
    color: '#0E7490',
    items: [
      {
        href: '/demo',
        name: '한 줄 질문(AI)',
        desc: '감사 자료를 바탕으로 한 줄로 질문하면 AI가 답해 주는 체험 기능입니다.',
      },
      {
        href: '/query',
        name: 'AI 질의서',
        desc: '지적사항·부서·예산 이상 항목을 고르면 AI가 의원 질의서 초안을 자동으로 만들어 줍니다. 어조·길이·형식을 바꿀 수 있습니다.',
      },
    ],
  },
  {
    title: '도구',
    menu: '상단 메뉴 「도구」',
    color: '#475569',
    items: [
      {
        href: '/search',
        name: '통합 검색',
        desc: '자료요구·지적사항·증인 등을 한 번에 검색합니다. 다른 위원회 결과도 찾아 해당 화면으로 이동합니다.',
      },
      {
        href: '/history',
        name: '변경 이력·백업',
        desc: '데이터를 누가 언제 등록·수정·삭제했는지 시간순으로 보고, 전체 자료를 JSON 파일로 백업합니다.',
      },
      {
        href: '/settings',
        name: 'AI 설정',
        desc: 'AI 공급자(제미나이·클로드·GPT)와 API 키를 등록합니다. 여기 키를 넣어야 의원별 발언 등에서 AI 자동 요약이 켜집니다.',
      },
      {
        href: '/guide',
        name: '사용방법 안내',
        desc: '지금 보고 계신 이 안내 페이지입니다. 기능 설명과 자주 묻는 질문을 모아 두었습니다.',
      },
    ],
  },
];

const STEPS = [
  {
    title: '1단계 — 위원회 고르기',
    body: '화면 맨 위 오른쪽 「위원회」 선택 상자에서 담당 위원회를 고릅니다. 이후 모든 자료가 그 위원회 기준으로 표시됩니다.',
  },
  {
    title: '2단계 — 메뉴에서 기능 찾기',
    body: '상단의 큰 메뉴(종합 현황 · 자료·부서 · 감사 진행 · 예산·결산 · AI 도우미 · 도구)에 마우스를 올리면 세부 기능이 펼쳐집니다. 아래 「전체 기능 안내」에서 각 기능 설명을 먼저 읽어 보세요.',
  },
  {
    title: '3단계 — AI 자동 정리 켜기(권장)',
    body: '「도구 → AI 설정」에서 Google Gemini 무료 키를 넣으면, 회의 발언이 속기 그대로가 아니라 주제별로 깔끔하게 자동 요약됩니다.',
  },
  {
    title: '4단계 — 문서로 내려받기',
    body: '정리된 표·보고서는 한글(HWP)·PDF·엑셀·ZIP으로 내려받아 보고에 바로 활용할 수 있습니다.',
  },
];

type Faq = { q: string; a: React.ReactNode };

const FAQS: Faq[] = [
  {
    q: '실국장 답변·의원 발언 칸에 속기가 그대로 길게 나옵니다. 왜 그런가요?',
    a: (
      <>
        AI 키가 없어 <strong>규칙기반(폴백)</strong>으로 표시되고 있어서입니다.{' '}
        <Link href="/settings" className="text-[#1F4E79] underline font-semibold">
          도구 → AI 설정
        </Link>
        에서 <strong>Google Gemini 무료 키</strong>만 넣으면, 날짜를 고를 때 그 회의가 주제별로
        간결하게 자동 정리됩니다.
      </>
    ),
  },
  {
    q: 'AI 키는 어디서 무료로 받나요?',
    a: (
      <>
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1F4E79] underline font-semibold"
        >
          Google AI Studio
        </a>
        에 접속해 로그인 후 <strong>Create API key</strong>를 누르면 즉시 무료 키(AIza… 형식)가
        발급됩니다. 그 키를 <Link href="/settings" className="text-[#1F4E79] underline">AI 설정</Link>의
        &quot;Google Gemini 키&quot; 칸에 붙여넣고 저장하세요. 클로드·GPT는 유료 키가 필요합니다.
      </>
    ),
  },
  {
    q: '뤼튼(Wrtn)을 연결하면 API 없이 쓸 수 있나요?',
    a: (
      <>
        권장하지 않습니다. 뤼튼은 일반 사용자용 서비스로 외부 프로그램이 호출할 수 있는{' '}
        <strong>공식 개발자 API가 공개되어 있지 않습니다.</strong> 비용 없이 시작하려면 위의 Google
        Gemini 무료 키를 사용하세요.
      </>
    ),
  },
  {
    q: '특정 날짜만 표로 보고 싶어요.',
    a: (
      <>
        「의원별 발언」에서 의원을 선택하면 <strong>가장 최근 회의 날짜가 자동 선택</strong>됩니다.
        다른 날짜는 표 위쪽의 <strong>날짜 칩</strong>을 클릭하면 그 회의만 다시 정리됩니다. 모든
        날짜가 통으로 나오지 않습니다.
      </>
    ),
  },
  {
    q: '표·보고서를 문서로 저장하려면?',
    a: (
      <>
        각 화면 상단의 <strong>HWP(워드) 다운로드</strong> 버튼으로 한글 문서를,{' '}
        <strong>PDF 인쇄</strong> 버튼으로 PDF를 받을 수 있습니다. 통계·목록 화면에서는{' '}
        <strong>엑셀 저장</strong>, 「자료 정리」에서는 <strong>ZIP 묶음</strong>으로 내려받습니다.
      </>
    ),
  },
  {
    q: '입력한 자료가 사라질까 걱정됩니다. 백업은?',
    a: (
      <>
        <Link href="/history" className="text-[#1F4E79] underline">
          도구 → 변경 이력·백업
        </Link>
        에서 누가 언제 무엇을 바꿨는지 확인할 수 있고, 전체 데이터를 JSON 파일로 내려받아 보관할 수
        있습니다.
      </>
    ),
  },
  {
    q: '위원회를 바꿨더니 내용이 달라졌어요.',
    a: (
      <>
        정상입니다. 화면 오른쪽 위 <strong>「위원회」 선택</strong>에 따라 자료가 그 위원회 기준으로
        바뀝니다. 보려는 위원회가 맞는지 먼저 확인하세요.
      </>
    ),
  },
];

export default function GuidePage() {
  const [tab, setTab] = useState<'features' | 'faq'>('features');

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-extrabold text-[#1F4E79]">사용방법 안내</h1>
      <p className="mt-2 text-sm text-gray-600">
        이 프로그램이 처음이어도 괜찮습니다. 아래 순서대로 따라 하면 행정사무감사 자료를 쉽게 정리할 수
        있습니다.
      </p>

      {/* 처음이라면: 4단계 */}
      <section className="mt-6">
        <h2 className="text-base font-bold text-gray-800">처음이라면 — 4단계만 기억하세요</h2>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-bold text-[#1F4E79]">{s.title}</h3>
              <p className="mt-1 text-sm text-gray-700 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI 설정 강조 박스 */}
      <section className="mt-6 rounded-xl border border-[#1F4E79]/30 bg-[#1F4E79]/[0.04] p-5">
        <h2 className="text-sm font-bold text-[#1F4E79]">💡 AI 자동 정리 켜기 (가장 중요)</h2>
        <p className="mt-2 text-sm text-gray-700 leading-relaxed">
          실국장 답변·의원 발언 칸에 속기가 그대로 길게 나오는 건 AI 키가 없어{' '}
          <strong>규칙기반(폴백)</strong>으로 표시되고 있어서입니다.{' '}
          <Link href="/settings" className="text-[#1F4E79] underline font-semibold">
            도구 → AI 설정
          </Link>
          에서 <strong>Google Gemini 무료 키</strong>만 넣으면, 날짜를 고를 때 그 회의가 주제별로
          간결하게 자동 정리됩니다.
        </p>
        <Link
          href="/settings"
          className="mt-3 inline-block rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a4267]"
        >
          AI 설정으로 이동
        </Link>
      </section>

      {/* 탭 */}
      <div className="mt-8 flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('features')}
          className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${
            tab === 'features'
              ? 'border-[#1F4E79] text-[#1F4E79]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          전체 기능 안내
        </button>
        <button
          type="button"
          onClick={() => setTab('faq')}
          className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${
            tab === 'faq'
              ? 'border-[#1F4E79] text-[#1F4E79]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          자주 묻는 질문
        </button>
      </div>

      {/* 전체 기능 안내 */}
      {tab === 'features' && (
        <section className="mt-5 space-y-6">
          <p className="text-xs text-gray-500">
            메뉴별로 어떤 기능인지 한 줄로 정리했습니다. 기능 이름을 누르면 바로 그 화면으로
            이동합니다.
          </p>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block h-4 w-1.5 rounded" style={{ backgroundColor: g.color }} />
                <h3 className="text-base font-bold text-gray-900">{g.title}</h3>
                <span className="text-xs text-gray-400">{g.menu}</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {g.items.map((f) => (
                  <Link
                    key={f.href}
                    href={f.href}
                    className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-[#1F4E79] hover:bg-[#1F4E79]/[0.02] transition-colors"
                  >
                    <span className="text-sm font-bold text-[#1F4E79]">{f.name}</span>
                    <span className="mx-2 text-gray-300">›</span>
                    <span className="text-sm text-gray-700">{f.desc}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 자주 묻는 질문 */}
      {tab === 'faq' && (
        <section className="mt-5">
          <div className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {FAQS.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-gray-900 flex items-start gap-2">
                  <span className="text-[#1F4E79] mt-0.5 transition-transform group-open:rotate-90">▶</span>
                  <span>{f.q}</span>
                </summary>
                <div className="mt-2 pl-6 text-sm text-gray-700 leading-relaxed">{f.a}</div>
              </details>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
