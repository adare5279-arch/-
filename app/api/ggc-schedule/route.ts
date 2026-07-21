export const runtime = 'nodejs';

// 경기도의회 의정캘린더(schedule/list)를 서버에서 대신 조회·파싱한다.
// 브라우저에서 직접 부르면 CORS로 막히므로 서버 라우트로 우회한다.
//
// GGC 달력은 /site/main/schedule/list/{YYYY-MM-01}/ALL 로 월 단위 렌더되고,
// 각 날짜 칸의 위원회 링크가 fn_calList(일,'코드') 형태로 들어 있다.
//   예) <a href="javascript:fn_calList(20,'C105')" class="C105"> 기재위 </a>

import { GGC_COMMITTEE_CODE } from '@/lib/ggc';

// GGC 위원회 코드 → 앱 위원회명 (표준 상임위는 GGC_COMMITTEE_CODE 역매핑)
const CODE_TO_COMMITTEE: Record<string, string> = Object.fromEntries(
  Object.entries(GGC_COMMITTEE_CODE).map(([name, code]) => [code, name]),
);

// 상임위가 아닌 코드(본회의·예결위·특위)의 표시용 이름 (스크랩 실패 시 폴백)
const NON_COMMITTEE_LABEL: Record<string, string> = {
  A011: '본회의',
  E020: '예결위',
  E030: '예결위(교육)',
  G007: '윤리위',
  G999: '기타특위',
};

type ScheduleItem = {
  code: string;
  short: string; // GGC가 칸에 표기하는 약칭 (예: 기재위, 본회의)
  committee: string | null; // 앱 위원회명(표준 상임위)일 때만, 아니면 null
};

type ScheduleDay = {
  date: string; // YYYY-MM-DD
  items: ScheduleItem[];
};

const MONTH_MIN = 1;
const YEAR_MIN = 2015;
const YEAR_MAX = 2027;

function parseSchedule(html: string, year: number, month: number): ScheduleDay[] {
  // day(1~31) → code → short label
  const byDay = new Map<number, Map<string, string>>();
  const re = /fn_calList\((\d+),'([^']*)'\)"[^>]*>\s*([^<]+?)\s*</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const dd = parseInt(m[1], 10);
    const code = m[2];
    const label = m[3].trim();
    if (!dd || dd < 1 || dd > 31) continue;
    if (!code || code === 'ALL') continue; // 'ALL'=날짜 헤더, ''=이동 버튼
    if (/^\d+$/.test(label)) continue; // 안전장치(숫자만이면 날짜)
    if (!byDay.has(dd)) byDay.set(dd, new Map());
    byDay.get(dd)!.set(code, label);
  }

  const mm = String(month).padStart(2, '0');
  const days: ScheduleDay[] = [];
  for (const [dd, codes] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const items: ScheduleItem[] = [...codes.entries()].map(([code, short]) => ({
      code,
      short: short || NON_COMMITTEE_LABEL[code] || code,
      committee: CODE_TO_COMMITTEE[code] ?? null,
    }));
    days.push({ date: `${year}-${mm}-${String(dd).padStart(2, '0')}`, items });
  }
  return days;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') ?? '', 10);
    const month = parseInt(searchParams.get('month') ?? '', 10);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < MONTH_MIN ||
      month > 12
    ) {
      return Response.json({ error: '잘못된 연/월', days: [] }, { status: 400 });
    }
    // GGC 게시 범위를 벗어나면 빈 결과 (에러 아님)
    if (year < YEAR_MIN || year > YEAR_MAX) {
      return Response.json({ year, month, days: [], sourceUrl: null });
    }

    const mm = String(month).padStart(2, '0');
    const url = `https://www.ggc.go.kr/site/main/schedule/list/${year}-${mm}-01/ALL`;

    const res = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'accept-language': 'ko-KR,ko;q=0.9',
      },
      // 의정캘린더는 자주 바뀌지 않으므로 6시간 캐시(GGC 부하 최소화)
      next: { revalidate: 21_600 },
    });

    if (!res.ok) {
      return Response.json(
        { error: `경기도의회 의정캘린더 조회 실패 (${res.status})`, days: [] },
        { status: 502 },
      );
    }

    const html = await res.text();
    const days = parseSchedule(html, year, month);

    return Response.json({ year, month, days, sourceUrl: url });
  } catch (e) {
    return Response.json({ error: String(e), days: [] }, { status: 500 });
  }
}
