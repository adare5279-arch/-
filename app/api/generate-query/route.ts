import { rateLimited, clientIp } from '@/lib/rateLimit';

const MAX_PROMPT = 20_000;
const MAX_SYSTEM = 10_000;

export async function POST(request: Request): Promise<Response> {
  try {
    if (rateLimited(`generate-query:${clientIp(request)}`)) {
      return Response.json(
        { error: '요청이 너무 잦습니다. 잠시 후 다시 시도하세요. (1분당 10회)' },
        { status: 429 },
      );
    }

    const body = (await request.json()) as {
      engine: string;
      prompt: string;
      model?: string;
      system?: string;
      apiKey?: string;
    };
    const { engine, prompt, model, system } = body;
    const userKey = body.apiKey?.trim();

    if (!prompt || typeof prompt !== 'string') {
      return Response.json({ error: '프롬프트가 없습니다.' }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT) {
      return Response.json(
        { error: `프롬프트가 너무 깁니다. ${MAX_PROMPT}자 이내로 입력하세요.` },
        { status: 400 },
      );
    }
    if (system && system.length > MAX_SYSTEM) {
      return Response.json(
        { error: `system 프롬프트가 너무 깁니다. ${MAX_SYSTEM}자 이내로 입력하세요.` },
        { status: 400 },
      );
    }

    if (engine === 'claude') {
      // 사용자가 입력한 개인 키를 우선 사용(브라우저에만 저장됨). 없으면 서버 공용 키.
      const key = userKey || process.env.ANTHROPIC_API_KEY;
      if (!key) {
        return Response.json(
          { error: 'Anthropic(Claude) API 키가 없습니다. 개별 API 키를 입력하거나 서버 환경변수(ANTHROPIC_API_KEY)를 설정하세요.' },
          { status: 400 }
        );
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model ?? 'claude-sonnet-4-5',
          max_tokens: 4000,
          temperature: 0.4,
          ...(system ? { system } : {}),
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const errText = (await res.text()).slice(0, 300);
        return Response.json(
          { error: `Anthropic API 오류: ${res.status} ${errText}` },
          { status: res.status }
        );
      }

      const data = (await res.json()) as {
        content?: Array<{ type: string; text: string }>;
      };
      return Response.json({ text: data.content?.[0]?.text ?? '' });
    }

    if (engine === 'openai') {
      // 사용자가 입력한 개인 키를 우선 사용(브라우저에만 저장됨). 없으면 서버 공용 키.
      const key = userKey || process.env.OPENAI_API_KEY;
      if (!key) {
        return Response.json(
          { error: 'OpenAI API 키가 없습니다. 개별 API 키를 입력하거나 서버 환경변수(OPENAI_API_KEY)를 설정하세요.' },
          { status: 400 }
        );
      }

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: model ?? 'gpt-4o',
          max_tokens: 4000,
          temperature: 0.4,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        const errText = (await res.text()).slice(0, 300);
        return Response.json(
          { error: `OpenAI API 오류: ${res.status} ${errText}` },
          { status: res.status }
        );
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return Response.json({ text: data.choices?.[0]?.message?.content ?? '' });
    }

    if (engine === 'gemini') {
      // 사용자가 입력한 개인 키를 우선 사용(브라우저에만 저장됨). 없으면 서버 공용 키.
      const key = userKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) {
        return Response.json(
          { error: 'Google(Gemini) API 키가 없습니다. 개별 API 키를 입력하거나 서버 환경변수(GEMINI_API_KEY)를 설정하세요.' },
          { status: 400 }
        );
      }

      const modelId = model ?? 'gemini-2.0-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 4000 },
          }),
        },
      );

      if (!res.ok) {
        const errText = (await res.text()).slice(0, 300);
        return Response.json(
          { error: `Gemini API 오류: ${res.status} ${errText}` },
          { status: res.status }
        );
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return Response.json({ text });
    }

    return Response.json({ error: '지원하지 않는 엔진' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
