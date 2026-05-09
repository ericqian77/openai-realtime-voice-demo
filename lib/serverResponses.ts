import { NextResponse } from "next/server";

export function missingApiKey() {
  return NextResponse.json(
    {
      error:
        "OpenAI API key is not configured. Add your key in the page, or configure .env.local for local development.",
    },
    { status: 500 },
  );
}

export function openAiError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "OpenAI request failed unexpectedly.";

  return NextResponse.json({ error: message }, { status: 500 });
}

export async function proxyOpenAiJson(response: Response) {
  const text = await response.text();
  let body: unknown;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || response.statusText };
  }

  return NextResponse.json(body, { status: response.status });
}
