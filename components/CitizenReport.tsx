'use client';

// 행정사무감사 도민제보 안내
// 출처: 경기도의회 https://www.ggc.go.kr/site/main/civil/civilAudit/list

const INCLUDE = [
  '행정의 위법 · 부당 사항',
  '예산낭비 · 사업 개선 건의',
  '도민 생활 불편사항',
];

const EXCLUDE = [
  '개인 사생활 침해',
  '진행 중인 재판 · 수사 사항',
  '인신공격 · 허위 비방',
  '익명 제보',
];

export default function CitizenReport() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-[#1F4E79]">행정사무감사 도민제보</h2>
          <p className="text-xs text-gray-500 mt-1">
            도청 · 교육청 행정 문제에 대한 도민 온라인 제보 창구
          </p>
        </div>
        <a
          href="https://www.ggc.go.kr/site/main/civil/civilAudit/list"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors whitespace-nowrap"
        >
          도민제보 바로가기 ↗
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-[#2E7D32]/30 bg-[#EDF5EE] p-3">
          <p className="text-xs font-semibold text-[#2E7D32] mb-2">제보 대상</p>
          <ul className="flex flex-col gap-1.5">
            {INCLUDE.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[13px] leading-snug text-gray-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2E7D32]" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-[#C62828]/30 bg-[#FBEDED] p-3">
          <p className="text-xs font-semibold text-[#C62828] mb-2">제외 대상</p>
          <ul className="flex flex-col gap-1.5">
            {EXCLUDE.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[13px] leading-snug text-gray-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C62828]" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-xs text-gray-400 leading-5">
        ※ 제보는 경기도의회 누리집의 도민제보 페이지에서 접수합니다. 접수 기간 및 등록 현황은 위
        링크에서 확인하세요.
      </p>
    </div>
  );
}
