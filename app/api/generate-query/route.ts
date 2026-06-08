export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      engine: string;
      prompt: string;
      model?: string;
      system?: string;
      apiKey?: string;
    };
    const { engine, prompt, model, system } = body;
    const userKey = body.apiKey?.trim();

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

    return Response.json({ error: '지원하지 않는 엔진' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
