import { NextRequest } from "next/server";

import {
  LANGUAGE_OPTIONS,
  pickAllowed,
  TRANSLATE_MODEL,
} from "@/lib/sessionConfig";
import { getOpenAIKey } from "@/lib/openaiKey";
import { missingApiKey, openAiError, proxyOpenAiJson } from "@/lib/serverResponses";

export const runtime = "nodejs";

const languageCodes = LANGUAGE_OPTIONS.map((language) => language.code);

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    apiKey?: string;
    targetLanguage?: string;
  };
  const apiKey = getOpenAIKey(body.apiKey);

  if (!apiKey) {
    return missingApiKey();
  }

  try {
    const language = pickAllowed(body.targetLanguage, languageCodes, "es");

    const response = await fetch(
      "https://api.openai.com/v1/realtime/translations/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": "openai-new-voice-demo",
        },
        body: JSON.stringify({
          expires_after: { anchor: "created_at", seconds: 600 },
          session: {
            model: TRANSLATE_MODEL,
            audio: {
              output: { language },
            },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    return proxyOpenAiJson(response);
  } catch (error) {
    return openAiError(error);
  }
}
