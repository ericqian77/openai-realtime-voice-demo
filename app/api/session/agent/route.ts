import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

import {
  buildAssistantInstructions,
  pickAllowed,
  REALTIME_MODEL,
  REASONING_EFFORTS,
  VOICES,
} from "@/lib/sessionConfig";
import { getOpenAIKey } from "@/lib/openaiKey";
import { missingApiKey, openAiError } from "@/lib/serverResponses";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    apiKey?: string;
    reasoningEffort?: string;
    voice?: string;
  };
  const apiKey = getOpenAIKey(body.apiKey);

  if (!apiKey) {
    return missingApiKey();
  }

  try {
    const reasoningEffort = pickAllowed(body.reasoningEffort, REASONING_EFFORTS, "low");
    const voice = pickAllowed(body.voice, VOICES, "marin");
    const client = new OpenAI({
      apiKey,
      timeout: 15_000,
    });

    const secret = await client.realtime.clientSecrets.create({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions: buildAssistantInstructions(),
        output_modalities: ["audio"],
        reasoning: { effort: reasoningEffort },
        tracing: "auto",
        audio: {
          input: {
            noise_reduction: { type: "near_field" },
            transcription: {
              model: "gpt-realtime-whisper",
              delay: "low",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 450,
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            voice,
            speed: 1,
          },
        },
      },
    });

    return NextResponse.json(secret);
  } catch (error) {
    return openAiError(error);
  }
}
