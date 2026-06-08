export const runtime = 'nodejs';
export const maxDuration = 300; // 긴 음성 전사를 위해 최대 실행시간 확대 (플랜 한도 내 적용)

const MAX_BYTES = 25 * 1024 * 1024; // OpenAI 음성 전사 요청당 한도 25MB

export async function POST(request: Request): Promise<Response> {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return Response.json(
        { error: 'OPENAI_API_KEY가 설정되지 않았습니다. .env.local 또는 배포 환경변수에 키를 넣어주세요.' },
        { status: 400 },
      );
    }

    const body = (await request.json()) as {
      fileUrl?: string;
      fileName?: string;
      language?: string;
    };
    const { fileUrl, fileName, language } = body;
    if (!fileUrl) {
      return Response.json({ error: '음성 파일 URL이 없습니다.' }, { status: 400 });
    }

    // Supabase Storage 등에 업로드된 파일을 서버에서 직접 내려받음
    // (브라우저 → Vercel 본문 4.5MB 제한을 우회)
    const audioRes = await fetch(fileUrl);
    if (!audioRes.ok) {
      return Response.json(
        { error: `음성 파일을 불러오지 못했습니다. (${audioRes.status})` },
        { status: 400 },
      );
    }
    const arrayBuf = await audioRes.arrayBuffer();
    if (arrayBuf.byteLength > MAX_BYTES) {
      const mb = (arrayBuf.byteLength / 1024 / 1024).toFixed(1);
      return Response.json(
        {
          error: `파일이 너무 큽니다(${mb}MB). 1단계는 요청당 25MB(약 50분, 64kbps 모노 기준)까지 지원합니다. 더 짧게 나누거나 낮은 비트레이트로 변환해 다시 시도하세요.`,
        },
        { status: 413 },
      );
    }

    const blob = new Blob([arrayBuf], {
      type: audioRes.headers.get('content-type') || 'application/octet-stream',
    });

    const fd = new FormData();
    fd.append('file', blob, fileName || 'audio');
    fd.append('model', 'whisper-1');
    fd.append('language', language || 'ko');
    fd.append('response_format', 'text');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: fd,
    });

    if (!res.ok) {
      const errText = (await res.text()).slice(0, 400);
      return Response.json(
        { error: `음성 전사 API 오류: ${res.status} ${errText}` },
        { status: res.status },
      );
    }

    // response_format=text → 본문이 곧 전사 결과
    const text = (await res.text()).trim();
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
