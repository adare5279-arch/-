'use client';

// 행정사무감사 절차 도식화
// 출처: 경기도의회 https://www.ggc.go.kr/site/main/content/admnsOfcad

type Stage = {
  no: number;
  title: string;
  color: string;
  bg: string;
  steps: string[];
};

const STAGES: Stage[] = [
  {
    no: 1,
    title: '준비단계',
    color: '#1F4E79',
    bg: '#EEF3F9',
    steps: [
      '본회의에서 감사 시기 결정',
      '감사계획서 작성 · 본회의 승인',
      '감사 대상 기관 확정',
      '서류제출 · 증인·참고인 · 현지확인 대상 선정',
      '감사계획서 대상기관 송달',
    ],
  },
  {
    no: 2,
    title: '실시단계',
    color: '#2E7D32',
    bg: '#EDF5EE',
    steps: [
      '감사실시 선언 및 위원장 인사',
      '증인 선서',
      '보고 및 질의 · 답변',
      '감사 결과 강평',
      '감사 종료 선언',
    ],
  },
  {
    no: 3,
    title: '결과처리단계',
    color: '#B45309',
    bg: '#FBF3E8',
    steps: [
      '위원회별 결과보고서 작성',
      '본회의 결과보고서 채택 · 시정요구사항 결정',
      '결과 도 · 대상기관 이송',
      '시정 · 처리결과 의회 보고',
    ],
  },
];

const POWERS = [
  '현지확인 · 서류제출요구 · 증인출석요구',
  '허위증언 시 고발 조치',
  '불응 시 500만원 이하 과태료',
];

export default function AuditFlow() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-[#1F4E79]">행정사무감사 절차</h2>
          <p className="text-xs text-gray-500 mt-1">
            지방자치법 제49조 근거 · 매년 1회 14일 이내 실시
          </p>
        </div>
        <a
          href="https://www.ggc.go.kr/site/main/content/admnsOfcad"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-[#1F4E79] bg-white px-3 py-1.5 text-xs font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors whitespace-nowrap"
        >
          경기도의회 안내 ↗
        </a>
      </div>

      {/* 단계 흐름 */}
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-3">
        {STAGES.map((stage, idx) => (
          <div key={stage.no} className="flex flex-col lg:flex-row lg:items-stretch gap-3 flex-1">
            <div
              className="flex-1 rounded-lg border p-4 flex flex-col gap-3"
              style={{ backgroundColor: stage.bg, borderColor: `${stage.color}33` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: stage.color }}
                >
                  {stage.no}
                </span>
                <span className="text-sm font-bold" style={{ color: stage.color }}>
                  {stage.title}
                </span>
              </div>
              <ol className="flex flex-col gap-1.5">
                {stage.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-gray-700">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* 단계 사이 화살표 */}
            {idx < STAGES.length - 1 && (
              <div className="flex items-center justify-center text-gray-300">
                <span className="hidden lg:block text-2xl leading-none">→</span>
                <span className="lg:hidden text-2xl leading-none">↓</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 위원회 권한 */}
      <div className="rounded-lg border border-dashed border-[#C62828]/40 bg-[#FBEDED] p-3">
        <p className="text-xs font-semibold text-[#C62828] mb-2">위원회 권한</p>
        <div className="flex flex-wrap gap-2">
          {POWERS.map((p) => (
            <span
              key={p}
              className="rounded-full bg-white border border-[#C62828]/30 px-3 py-1 text-xs text-[#C62828]"
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
