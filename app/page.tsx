"use client";

import {
  Activity,
  Captions,
  Gauge,
  Languages,
  Mic,
  Pause,
  PhoneCall,
  Radio,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OpenAIRealtimeWebRTC,
  RealtimeAgent,
  RealtimeSession,
  tool,
} from "@openai/agents/realtime";
import { z } from "zod";

import {
  LANGUAGE_OPTIONS,
  REALTIME_MODEL,
  REASONING_EFFORTS,
  TRANSCRIPTION_DELAYS,
  VOICES,
  type LanguageCode,
  type ReasoningEffort,
  type TranscriptionDelay,
  type Voice,
} from "@/lib/sessionConfig";
import { type RealtimeEvent, useRealtimeRtc } from "@/hooks/useRealtimeRtc";

type Mode = "assistant" | "translate" | "transcribe";
type ConnectionState = "idle" | "connecting" | "live" | "error";
type MetricName = "connected" | "firstDelta" | "firstAudio" | "turnDone";

type MetricState = Record<MetricName, number | null>;
type TranscriptLine = {
  id: string;
  source: "user" | "assistant" | "translation" | "transcribe" | "system";
  label: string;
  text: string;
  live?: boolean;
};
type ToolLine = {
  id: string;
  name: string;
  detail: string;
  elapsed?: number;
};

const emptyMetrics: MetricState = {
  connected: null,
  firstDelta: null,
  firstAudio: null,
  turnDone: null,
};

const modeCopy: Record<
  Mode,
  {
    label: string;
    model: string;
    icon: typeof Mic;
    headline: string;
    description: string;
    button: string;
  }
> = {
  assistant: {
    label: "Assistant",
    model: REALTIME_MODEL,
    icon: PhoneCall,
    headline: "Realtime voice agent",
    description: "Speech-to-speech reasoning, interruption, and local demo tools.",
    button: "Start assistant",
  },
  translate: {
    label: "Translate",
    model: "gpt-realtime-translate",
    icon: Languages,
    headline: "Live interpreter",
    description: "Source microphone audio becomes translated speech and subtitles.",
    button: "Start translation",
  },
  transcribe: {
    label: "Transcribe",
    model: "gpt-realtime-whisper",
    icon: Captions,
    headline: "Streaming captions",
    description: "Low-latency transcript deltas from a dedicated transcription session.",
    button: "Start captions",
  },
};

export default function Home() {
  const [mode, setMode] = useState<Mode>("assistant");
  const [assistantStatus, setAssistantStatus] = useState<ConnectionState>("idle");
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [voice, setVoice] = useState<Voice>("marin");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("low");
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("es");
  const [inputLanguage, setInputLanguage] = useState<LanguageCode>("en");
  const [transcriptionDelay, setTranscriptionDelay] =
    useState<TranscriptionDelay>("low");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [metrics, setMetrics] = useState<MetricState>(emptyMetrics);
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [toolLines, setToolLines] = useState<ToolLine[]>([]);
  const [assistantDraft, setAssistantDraft] = useState("");
  const [translationSourceDraft, setTranslationSourceDraft] = useState("");
  const [translationOutputDraft, setTranslationOutputDraft] = useState("");
  const [transcriptionDraft, setTranscriptionDraft] = useState("");
  const agentSessionRef = useRef<RealtimeSession | null>(null);
  const agentAudioRef = useRef<HTMLAudioElement | null>(null);
  const agentStartedAtRef = useRef(0);
  const agentFirstDeltaRef = useRef(false);
  const agentFirstAudioRef = useRef(false);

  const activeCopy = modeCopy[mode];
  const trimmedApiKey = openAiApiKey.trim();

  useEffect(() => {
    setOpenAiApiKey(window.sessionStorage.getItem("openai-realtime-demo-key") ?? "");
  }, []);

  const updateOpenAiApiKey = useCallback((value: string) => {
    setOpenAiApiKey(value);
    const trimmed = value.trim();
    if (trimmed) {
      window.sessionStorage.setItem("openai-realtime-demo-key", trimmed);
    } else {
      window.sessionStorage.removeItem("openai-realtime-demo-key");
    }
  }, []);

  const sessionKeyPayload = useCallback(
    () => (trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
    [trimmedApiKey],
  );

  const recordMetric = useCallback((name: MetricName, value: number) => {
    setMetrics((current) => ({
      ...current,
      [name]: Math.round(value),
    }));
  }, []);

  const resetRunState = useCallback(() => {
    setMetrics(emptyMetrics);
    setTranscripts([]);
    setToolLines([]);
    setAssistantDraft("");
    setTranslationSourceDraft("");
    setTranslationOutputDraft("");
    setTranscriptionDraft("");
    setAssistantError(null);
  }, []);

  const appendTranscript = useCallback((line: Omit<TranscriptLine, "id">) => {
    setTranscripts((current) => [
      {
        id: crypto.randomUUID(),
        ...line,
      },
      ...current,
    ].slice(0, 12));
  }, []);

  const demoLookupTool = useMemo(
    () =>
      tool({
        name: "lookup_demo_record",
        description:
          "Look up local demo data for schedule, order, or account examples. Use when the user asks about schedules, meetings, shipments, orders, or account status.",
        parameters: z.object({
          kind: z.enum(["schedule", "order", "account"]),
          id: z.string().optional(),
        }),
        strict: true,
        execute: async ({ kind, id }) => {
          const startedAt = performance.now();
          await new Promise((resolve) => window.setTimeout(resolve, 280));
          const result = {
            kind,
            id: id ?? "demo-5086",
            source: "local-demo-tool",
            result:
              kind === "schedule"
                ? "Next item is a 2:30 PM voice-model review with a 15 minute buffer."
                : kind === "order"
                  ? "Order A7-Q19-5086 is in transit and scheduled for delivery tomorrow morning."
                  : "Account is active, usage monitoring is enabled, and realtime API access should be verified in the dashboard.",
          };
          setToolLines((current) => [
            {
              id: crypto.randomUUID(),
              name: "lookup_demo_record",
              detail: `${kind}${id ? `:${id}` : ""}`,
              elapsed: Math.round(performance.now() - startedAt),
            },
            ...current,
          ]);
          return JSON.stringify(result);
        },
      }),
    [],
  );

  const handleAgentEvent = useCallback(
    (event: Record<string, unknown>) => {
      if (
        typeof event.delta === "string" &&
        (event.type === "transcript_delta" ||
          event.type === "response.audio_transcript.delta")
      ) {
        if (!agentFirstDeltaRef.current) {
          agentFirstDeltaRef.current = true;
          recordMetric("firstDelta", performance.now() - agentStartedAtRef.current);
        }
        setAssistantDraft((current) => current + event.delta);
      }

      if (
        event.type === "response.audio_transcript.done" ||
        event.type === "audio_done"
      ) {
        setAssistantDraft((current) => {
          if (current.trim()) {
            appendTranscript({
              source: "assistant",
              label: "Assistant",
              text: current.trim(),
            });
          }
          return "";
        });
      }

      if (
        event.type === "conversation.item.input_audio_transcription.completed" &&
        typeof event.transcript === "string"
      ) {
        appendTranscript({
          source: "user",
          label: "You",
          text: event.transcript,
        });
      }

      if (
        event.type === "response.done" ||
        event.type === "turn_done" ||
        event.type === "audio_done"
      ) {
        recordMetric("turnDone", performance.now() - agentStartedAtRef.current);
      }
    },
    [appendTranscript, recordMetric],
  );

  const stopAssistant = useCallback(() => {
    agentSessionRef.current?.close();
    agentSessionRef.current = null;
    if (agentAudioRef.current) {
      agentAudioRef.current.pause();
      agentAudioRef.current.srcObject = null;
      agentAudioRef.current.remove();
      agentAudioRef.current = null;
    }
    setAssistantStatus("idle");
  }, []);

  const startAssistant = useCallback(async () => {
    if (assistantStatus === "connecting" || assistantStatus === "live") {
      return;
    }

    resetRunState();
    setAssistantStatus("connecting");
    agentStartedAtRef.current = performance.now();
    agentFirstDeltaRef.current = false;
    agentFirstAudioRef.current = false;

    try {
      const tokenResponse = await fetchWithTimeout("/api/session/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sessionKeyPayload(), reasoningEffort, voice }),
      });
      const token = (await tokenResponse.json()) as {
        value?: string;
        error?: string;
      };

      if (!tokenResponse.ok || !token.value) {
        throw new Error(token.error ?? "Failed to create realtime agent token.");
      }

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      agentAudioRef.current = audio;
      audio.addEventListener("playing", () => {
        if (!agentFirstAudioRef.current) {
          agentFirstAudioRef.current = true;
          recordMetric("firstAudio", performance.now() - agentStartedAtRef.current);
        }
      });

      const agent = new RealtimeAgent({
        name: "Voice Lab Assistant",
        instructions:
          "You are a concise voice assistant for testing realtime voice models. Keep replies short. Use lookup_demo_record for schedules, orders, shipments, and account status.",
        tools: [demoLookupTool],
      });

      const session = new RealtimeSession(agent, {
        model: REALTIME_MODEL,
        transport: new OpenAIRealtimeWebRTC({ audioElement: audio }),
        config: {
          outputModalities: ["audio"],
          reasoning: { effort: reasoningEffort },
          audio: {
            input: {
              noiseReduction: { type: "near_field" },
              transcription: { model: "gpt-realtime-whisper" },
              turnDetection: {
                type: "server_vad",
                threshold: 0.5,
                prefixPaddingMs: 300,
                silenceDurationMs: 450,
                createResponse: true,
                interruptResponse: true,
              },
            },
            output: { voice, speed: 1 },
          },
        },
      });

      session.on("transport_event", (event) => handleAgentEvent(event));
      session.on("agent_tool_start", (_context, _agent, toolInfo) => {
        setToolLines((current) => [
          {
            id: crypto.randomUUID(),
            name: toolInfo.name ?? "tool",
            detail: "started",
          },
          ...current,
        ]);
      });
      session.on("agent_tool_end", (_context, _agent, toolInfo, result) => {
        setToolLines((current) => [
          {
            id: crypto.randomUUID(),
            name: toolInfo.name ?? "tool",
            detail: result,
          },
          ...current,
        ]);
      });
      session.on("error", ({ error }) => {
        setAssistantError(error instanceof Error ? error.message : String(error));
        setAssistantStatus("error");
      });

      agentSessionRef.current = session;
      await withTimeout(
        session.connect({ apiKey: token.value, model: REALTIME_MODEL }),
        15_000,
        "Timed out connecting to OpenAI Realtime over WebRTC.",
      );
      setAssistantStatus("live");
      recordMetric("connected", performance.now() - agentStartedAtRef.current);
    } catch (caught) {
      setAssistantError(
        caught instanceof Error ? caught.message : "Failed to start assistant.",
      );
      stopAssistant();
      setAssistantStatus("error");
    }
  }, [
    assistantStatus,
    demoLookupTool,
    handleAgentEvent,
    reasoningEffort,
    recordMetric,
    resetRunState,
    sessionKeyPayload,
    stopAssistant,
    voice,
  ]);

  const handleTranslationEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type === "session.input_transcript.delta" && event.delta) {
        setTranslationSourceDraft((current) => current + event.delta);
      }
      if (event.type === "session.output_transcript.delta" && event.delta) {
        setTranslationOutputDraft((current) => current + event.delta);
      }
      if (event.type?.includes("input_transcript.done")) {
        setTranslationSourceDraft((current) => {
          if (current.trim()) {
            appendTranscript({
              source: "user",
              label: "Source",
              text: current.trim(),
            });
          }
          return "";
        });
      }
      if (event.type?.includes("output_transcript.done")) {
        setTranslationOutputDraft((current) => {
          if (current.trim()) {
            appendTranscript({
              source: "translation",
              label: "Translation",
              text: current.trim(),
            });
          }
          return "";
        });
      }
      if (event.error?.message) {
        appendTranscript({
          source: "system",
          label: "Error",
          text: event.error.message,
        });
      }
    },
    [appendTranscript],
  );

  const handleTranscribeEvent = useCallback(
    (event: RealtimeEvent) => {
      if (
        typeof event.delta === "string" &&
        (event.type?.includes("transcription.delta") ||
          event.type?.includes("transcript.delta"))
      ) {
        setTranscriptionDraft((current) => current + event.delta);
      }
      if (
        typeof event.transcript === "string" &&
        (event.type?.includes("transcription.completed") ||
          event.type?.includes("transcript.done"))
      ) {
        appendTranscript({
          source: "transcribe",
          label: "Transcript",
          text: event.transcript,
        });
        setTranscriptionDraft("");
      }
      if (event.error?.message) {
        appendTranscript({
          source: "system",
          label: "Error",
          text: event.error.message,
        });
      }
    },
    [appendTranscript],
  );

  const translateBody = useCallback(
    () => ({ ...sessionKeyPayload(), targetLanguage }),
    [sessionKeyPayload, targetLanguage],
  );
  const transcribeBody = useCallback(
    () => ({
      ...sessionKeyPayload(),
      delay: transcriptionDelay,
      language: inputLanguage,
    }),
    [inputLanguage, sessionKeyPayload, transcriptionDelay],
  );

  const translateRtc = useRealtimeRtc({
    mode: "translate",
    sessionEndpoint: "/api/session/translate",
    callsEndpoint: "https://api.openai.com/v1/realtime/translations/calls",
    sessionBody: translateBody,
    onEvent: handleTranslationEvent,
    onMetric: recordMetric,
  });
  const transcribeRtc = useRealtimeRtc({
    mode: "transcribe",
    sessionEndpoint: "/api/session/transcribe",
    callsEndpoint: "https://api.openai.com/v1/realtime/calls",
    sessionBody: transcribeBody,
    onEvent: handleTranscribeEvent,
    onMetric: recordMetric,
  });

  const activeStatus =
    mode === "assistant"
      ? assistantStatus
      : mode === "translate"
        ? translateRtc.status
        : transcribeRtc.status;
  const activeError =
    mode === "assistant"
      ? assistantError
      : mode === "translate"
        ? translateRtc.error
        : transcribeRtc.error;

  const startActive = () => {
    if (mode === "assistant") {
      void startAssistant();
    } else if (mode === "translate") {
      resetRunState();
      void translateRtc.start();
    } else {
      resetRunState();
      void transcribeRtc.start();
    }
  };

  const stopActive = () => {
    if (mode === "assistant") {
      stopAssistant();
    } else if (mode === "translate") {
      translateRtc.stop();
    } else {
      transcribeRtc.stop();
    }
  };

  const liveDrafts = [
    assistantDraft && {
      source: "assistant" as const,
      label: "Assistant live",
      text: assistantDraft,
      live: true,
    },
    translationSourceDraft && {
      source: "user" as const,
      label: "Source live",
      text: translationSourceDraft,
      live: true,
    },
    translationOutputDraft && {
      source: "translation" as const,
      label: "Translation live",
      text: translationOutputDraft,
      live: true,
    },
    transcriptionDraft && {
      source: "transcribe" as const,
      label: "Transcript live",
      text: transcriptionDraft,
      live: true,
    },
  ].filter(Boolean) as Omit<TranscriptLine, "id">[];

  return (
    <main className="appShell">
      <section className="appFrame" aria-label="OpenAI realtime voice lab">
        <header className="topBar">
          <div className="brandBlock">
            <div className="brandMark" aria-hidden="true">
              <Radio size={20} />
            </div>
            <div>
              <p className="kicker">Realtime Voice Lab</p>
              <h1>Realtime Voice Lab</h1>
            </div>
          </div>
          <div className="statusCluster" aria-label="session status">
            <span className={`statusChip keyStatus ${trimmedApiKey ? "loaded" : ""}`}>
              <span className="statusDot" />
              {trimmedApiKey ? "Credentials ready" : "Credentials needed"}
            </span>
            <span className="statusChip">
              <Mic size={14} />
              Mic ready
            </span>
            <span className="modelBadge">{activeCopy.model}</span>
            <span className={`statusPill ${activeStatus}`}>{activeStatus}</span>
          </div>
        </header>

        <nav className="modeTabs" aria-label="voice demo modes">
          {(Object.keys(modeCopy) as Mode[]).map((item) => {
            const Icon = modeCopy[item].icon;
            return (
              <button
                key={item}
                className={mode === item ? "selected" : ""}
                onClick={() => setMode(item)}
                type="button"
              >
                <Icon size={18} />
                <span>{modeCopy[item].label}</span>
              </button>
            );
          })}
        </nav>

        <section className="sessionCard" aria-label="session controls">
          <div className="sessionIntro">
            <div className="modelIcon">
              <activeCopy.icon size={24} />
            </div>
            <div>
              <p className="modelName">{activeCopy.model}</p>
              <h2>{activeCopy.headline}</h2>
              <p>{activeCopy.description}</p>
            </div>
          </div>

          <div className="voiceStage">
            <div className="waveform" aria-hidden="true">
              {Array.from({ length: 36 }, (_, index) => (
                <span
                  key={index}
                  style={
                    { "--height": `${22 + ((index * 17) % 52)}%` } as React.CSSProperties
                  }
                />
              ))}
            </div>

            <button
              className={`micButton ${activeStatus === "live" ? "active" : ""}`}
              onClick={
                activeStatus === "live" || activeStatus === "connecting"
                  ? stopActive
                  : startActive
              }
              type="button"
            >
              {activeStatus === "live" || activeStatus === "connecting" ? (
                <Pause size={34} />
              ) : (
                <Mic size={38} />
              )}
            </button>

            <div className="sessionCopy">
              <h3>
                {activeStatus === "live"
                  ? "Session live"
                  : activeStatus === "connecting"
                    ? "Connecting"
                    : "Start session"}
              </h3>
              <p>Tap to connect and start speaking</p>
            </div>

            <button className="ghostButton" onClick={resetRunState} type="button">
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </section>

        {activeError ? <p className="errorBanner">{activeError}</p> : null}

        <section className="settingsStrip" aria-label="model settings">
          <div className="settingTitle">
            <Settings2 size={15} />
            Session settings
          </div>
          <div className="settingControls">
            <label>
              Voice
              <select value={voice} onChange={(event) => setVoice(event.target.value as Voice)}>
                {VOICES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reasoning
              <select
                value={reasoningEffort}
                onChange={(event) =>
                  setReasoningEffort(event.target.value as ReasoningEffort)
                }
              >
                {REASONING_EFFORTS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Translate to
              <select
                value={targetLanguage}
                onChange={(event) =>
                  setTargetLanguage(event.target.value as LanguageCode)
                }
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Transcribe
              <select
                value={inputLanguage}
                onChange={(event) => setInputLanguage(event.target.value as LanguageCode)}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Whisper delay
              <select
                value={transcriptionDelay}
                onChange={(event) =>
                  setTranscriptionDelay(event.target.value as TranscriptionDelay)
                }
              >
                {TRANSCRIPTION_DELAYS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="apiKeySetting" title="Stored only in this browser tab">
              OpenAI key
              <input
                autoComplete="off"
                onChange={(event) => updateOpenAiApiKey(event.target.value)}
                placeholder="Paste key"
                spellCheck={false}
                type="password"
                value={openAiApiKey}
              />
            </label>
          </div>
        </section>

        <section className="resultsGrid">
          <section className="transcriptPanel" aria-label="live transcripts">
            <div className="sectionHeader">
              <div>
                <p>Live transcript</p>
                <h3>Realtime stream</h3>
              </div>
              <button className="clearButton" onClick={resetRunState} type="button">
                Clear
              </button>
            </div>
            <div className="transcriptList">
              {liveDrafts.map((line, index) => (
                <TranscriptRow
                  key={`${line.label}-${index}`}
                  line={{ ...line, id: `${line.label}-${index}` }}
                />
              ))}
              {transcripts.length === 0 && liveDrafts.length === 0 ? (
                <div className="emptyState">
                  Start a real API session and speak into the microphone. No model
                  responses are simulated.
                </div>
              ) : null}
              {transcripts.map((line) => (
                <TranscriptRow key={line.id} line={line} />
              ))}
              {toolLines.length > 0 ? (
                <div className="toolSummary">
                  <span>Tool calls</span>
                  <p>{toolLines[0].detail}</p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="latencyPanel" aria-label="performance metrics">
            <div className="sectionHeader">
              <div>
                <p>Latency</p>
                <h3>Session timing</h3>
              </div>
              <Gauge size={17} />
            </div>
            <div className="metricsGrid">
              <Metric label="Connect" value={metrics.connected} />
              <Metric label="First delta" value={metrics.firstDelta} />
              <Metric label="First audio" value={metrics.firstAudio} />
              <Metric label="Turn done" value={metrics.turnDone} />
            </div>
          </section>
        </section>
      </section>
    </main>
  );

  function Metric({ label, value }: { label: string; value: number | null }) {
    return (
      <div className="metricCard">
        <Activity size={14} />
        <span>{label}</span>
        <strong>{value === null ? "..." : `${value}ms`}</strong>
      </div>
    );
  }

  function TranscriptRow({ line }: { line: TranscriptLine }) {
    return (
      <article className={`transcriptRow ${line.source} ${line.live ? "live" : ""}`}>
        <span>{line.label}</span>
        <p>{line.text}</p>
      </article>
    );
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 15_000,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  let timeout: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      window.clearTimeout(timeout);
    }
  }
}
