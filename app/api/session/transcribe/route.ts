import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

import {
  LANGUAGE_OPTIONS,
  pickAllowed,
  TRANSCRIBE_MODEL,
  TRANSCRIPTION_DELAYS,
} from "@/lib/sessionConfig";
import { getOpenAIKey } from "@/lib/openaiKey";
import { missingApiKey, openAiError } from "@/lib/serverResponses";

export const runtime = "nodejs";

const languageCodes = LANGUAGE_OPTIONS.map((language) => language.code);

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    apiKey?: string;
    delay?: string;
    language?: string;
  };
  const apiKey = getOpenAIKey(body.apiKey);

  if (!apiKey) {
    return missingApiKey();
  }

  try {
    const language = pickAllowed(body.language, languageCodes, "en");
    const delay = pickAllowed(body.delay, TRANSCRIPTION_DELAYS, "low");
    const client = new OpenAI({
      apiKey,
      timeout: 15_000,
    });

    const secret = await client.realtime.clientSecrets.create({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "transcription",
        audio: {
          input: {
            noise_reduction: { type: "near_field" },
            transcription: {
              model: TRANSCRIBE_MODEL,
              language,
              delay,
            },
            turn_detection: null,
          },
        },
      },
    });

    return NextResponse.json(secret);
  } catch (error) {
    return openAiError(error);
  }
}
