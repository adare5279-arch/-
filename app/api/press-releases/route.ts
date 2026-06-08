export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 경기도의회 "의원 보도자료" 게시판을 서버에서 대신 조회·파싱한다.
// (브라우저에서 직접 호출하면 CORS로 막히므로 서버 라우트로 우회)
const BASE = 'https://www.ggc.go.kr/site/main/xb/lwmkr/lawmakerpressrelease';

type PressItem = {
  id: string;
  title: string;
  author: string; // 제목 앞부분에서 추정한 의원/위원회명
  date: string;
  views: string;
  url: string;
};

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 제목 앞부분에서 작성자(의원/위원장/위원회/의장) 추정
function guessAuthor(title: string): string {
  const head = title.split(',')[0]?.trim() ?? '';
  if (/(의원|위원장|위원회|의장|부의장)$/.test(head) && head.length <= 25) {
    return head;
  }
  return '';
}

function parseRows(html: string): PressItem[] {
  const items: PressItem[] = [];
  const rows = html.split('<tr');
  for (const row of rows) {
    const linkMatch = row.match(
      /lawmakerpressrelease\/(\d+)\?[^"']*["']\s*>([\s\S]*?)<\/a>/,
    );
    if (!linkMatch) continue;
    const id = linkMatch[1];
    const title = stripTags(linkMatch[2]);
    if (!title) continue;
    const dateMatch = row.match(/(\d{4}-\d{2}-\d{2})/);
    // 날짜 td 이후의 조회수 td (마지막 숫자만 있는 td)
    const viewsMatch = row.match(/<td[^>]*class="pc"[^>]*>\s*([\d,]+)\s*<\/td>\s*<\/tr>/);
    items.push({
      id,
      title,
      author: guessAuthor(title),
      date: dateMatch?.[1] ?? '',
      views: viewsMatch?.[1] ?? '',
      url: `${BASE}/${id}`,
    });
  }
  return items;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const sv = (searchParams.get('q') ?? '').trim();
    const scParam = searchParams.get('field') ?? ''; // '' | baTitle | baContentPlain
    const sc = ['baTitle', 'baContentPlain'].includes(scParam) ? scParam : '';
    const cp = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const pageSize = [10, 20, 40].includes(Number(searchParams.get('size')))
      ? searchParams.get('size')!
      : '20';

    const url =
      `${BASE}?bcId=lawmakerpressrelease` +
      `&sc=${encodeURIComponent(sc)}` +
      `&sv=${encodeURIComponent(sv)}` +
      `&cp=${cp}` +
      `&pageSize=${pageSize}`;

    const res = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'accept-language': 'ko-KR,ko;q=0.9',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return Response.json(
        { error: `경기도의회 보도자료 조회 실패 (${res.status})`, items: [] },
        { status: 502 },
      );
    }

    const html = await res.text();
    const items = parseRows(html);
    const hasNext = items.length >= Number(pageSize);

    return Response.json({
      items,
      page: cp,
      hasNext,
      sourceUrl: url,
    });
  } catch (e) {
    return Response.json({ error: String(e), items: [] }, { status: 500 });
  }
}
