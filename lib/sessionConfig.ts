export const REALTIME_MODEL = "gpt-realtime-2";
export const TRANSLATE_MODEL = "gpt-realtime-translate";
export const TRANSCRIBE_MODEL = "gpt-realtime-whisper";

export const VOICES = ["marin", "cedar", "alloy", "sage", "coral"] as const;
export const REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh"] as const;
export const TRANSCRIPTION_DELAYS = ["minimal", "low", "medium", "high", "xhigh"] as const;

export type Voice = (typeof VOICES)[number];
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export type TranscriptionDelay = (typeof TRANSCRIPTION_DELAYS)[number];

export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "zh", label: "Chinese" },
  { code: "es", label: "Spanish" },
  { code: "ja", label: "Japanese" },
  { code: "fr", label: "French" },
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["code"];

export function pickAllowed<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowed.includes(value)
    ? (value as T[number])
    : fallback;
}

export function buildAssistantInstructions() {
  return [
    "You are a concise bilingual voice demo guide for an OpenAI realtime voice lab.",
    "Keep spoken replies short unless the user asks for detail.",
    "When audio is unclear, ask the user to repeat it in the same language.",
    "For numbers, dates, order IDs, and names, repeat the critical value back before acting.",
    "When the user asks to look up a schedule, meeting, order, shipment, or account detail, call the available tool.",
    "After a tool result, summarize the result naturally and mention that the data source is a local demo tool.",
  ].join("\n");
}
