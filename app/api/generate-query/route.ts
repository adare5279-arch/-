export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      engine: string;
      prompt: string;
      model?: string;
    };
    const { engine, prompt, model } = body;

    if (engine === 'claude') {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) {
        return Response.json(
          { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local에 키를 넣어주세요.' },
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
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        return Response.json(
          { error: 'OPENAI_API_KEY가 설정되지 않았습니다. .env.local에 키를 넣어주세요.' },
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
          messages: [{ role: 'user', content: prompt }],
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
