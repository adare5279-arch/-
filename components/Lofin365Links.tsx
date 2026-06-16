'use client';

// 지방재정365(lofin365.go.kr) 바로가기 패널.
// 행정안전부 지방재정통합공개시스템의 공식 공시·통계·데이터 페이지로 연결한다.
// 예산·결산·분석 화면에서 공시 원본을 즉시 대조할 수 있도록 한다.

type LinkDef = { label: string; desc: string; href: string };

const LINKS: LinkDef[] = [
  {
    label: '지방재정365 메인',
    desc: '예산·결산 통합공시, 재정통계 전체',
    href: 'https://www.lofin365.go.kr/',
  },
  {
    label: '우리 지자체 재정자립도',
    desc: '재정자립도·재정자주도 자치단체 통계',
    href: 'https://www.lofin365.go.kr/portal/LF3140101.do',
  },
  {
    label: '재정데이터 개방 (Open API)',
    desc: '재정공시 데이터 다운로드·연계',
    href: 'https://www.data.go.kr/data/15138709/openapi.do',
  },
  {
    label: 'e-나라지표: 재정자립도',
    desc: '지표 정의·산식·연도별 추이',
    href: 'https://www.index.go.kr/unity/potal/main/EachDtlPageDetail.do?idx_cd=2458',
  },
  {
    label: 'e-나라지표: 재정자주도',
    desc: '지표 정의·산식·연도별 추이',
    href: 'https://www.index.go.kr/unity/potal/main/EachDtlPageDetail.do?idx_cd=2857',
  },
];

export default function Lofin365Links({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-lg border border-[#1F4E79]/30 bg-[#1F4E79]/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold text-[#1F4E79]">지방재정365 연결</span>
        <span className="text-[10px] rounded bg-[#1F4E79]/15 text-[#1F4E79] px-1.5 py-0.5">
          행정안전부 공식 공시
        </span>
      </div>
      {!compact && (
        <p className="text-xs text-gray-600 mb-3">
          예산·결산 공시 원본과 재정건전성 지표를 지방재정365에서 직접 대조하세요. (새 창)
        </p>
      )}
      <div className={`grid gap-2 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded border border-gray-200 bg-white p-2.5 hover:border-[#1F4E79] hover:shadow-sm transition-all"
          >
            <p className="text-sm font-medium text-[#1F4E79] group-hover:underline flex items-center gap-1">
              {l.label}
              <span aria-hidden className="text-xs">↗</span>
            </p>
            {!compact && <p className="text-xs text-gray-500 mt-0.5">{l.desc}</p>}
          </a>
        ))}
      </div>
    </div>
  );
}
