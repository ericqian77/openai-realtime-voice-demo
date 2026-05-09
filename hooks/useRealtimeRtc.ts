"use client";

import { useCallback, useRef, useState } from "react";

type MetricName = "connected" | "firstDelta" | "firstAudio" | "turnDone";

type SecretResponse = {
  value?: string;
  error?: string;
};

export type RtcMode = "translate" | "transcribe";

export type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
  [key: string]: unknown;
};

export type UseRealtimeRtcOptions = {
  mode: RtcMode;
  sessionEndpoint: string;
  callsEndpoint: string;
  sessionBody: () => Record<string, unknown>;
  onEvent: (event: RealtimeEvent) => void;
  onMetric: (name: MetricName, value: number) => void;
};

export function useRealtimeRtc({
  mode,
  sessionEndpoint,
  callsEndpoint,
  sessionBody,
  onEvent,
  onMetric,
}: UseRealtimeRtcOptions) {
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const firstDeltaRef = useRef(false);
  const firstAudioRef = useRef(false);
  const startedAtRef = useRef(0);

  const stop = useCallback((nextStatus: "idle" | "error" = "idle") => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }

    firstDeltaRef.current = false;
    firstAudioRef.current = false;
    setStatus(nextStatus);
  }, []);

  const start = useCallback(async () => {
    if (status === "connecting" || status === "live") {
      return;
    }

    setError(null);
    setStatus("connecting");
    startedAtRef.current = performance.now();
    firstDeltaRef.current = false;
    firstAudioRef.current = false;

    try {
      const secretResponse = await fetchWithTimeout(sessionEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionBody()),
      });
      const secret = (await secretResponse.json()) as SecretResponse;

      if (!secretResponse.ok || !secret.value) {
        throw new Error(secret.error ?? "Failed to create realtime client secret.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audioRef.current = audio;

      audio.addEventListener("playing", () => {
        if (!firstAudioRef.current) {
          firstAudioRef.current = true;
          onMetric("firstAudio", performance.now() - startedAtRef.current);
        }
      });

      pc.ontrack = ({ streams }) => {
        audio.srcObject = streams[0];
        void audio.play().catch(() => undefined);
        if (!firstAudioRef.current) {
          firstAudioRef.current = true;
          onMetric("firstAudio", performance.now() - startedAtRef.current);
        }
      };

      const dc = pc.createDataChannel("oai-events");
      dc.addEventListener("message", ({ data }) => {
        const event = JSON.parse(data as string) as RealtimeEvent;
        if (!firstDeltaRef.current && hasTranscriptDelta(event)) {
          firstDeltaRef.current = true;
          onMetric("firstDelta", performance.now() - startedAtRef.current);
        }
        if (isTurnDone(event)) {
          onMetric("turnDone", performance.now() - startedAtRef.current);
        }
        onEvent(event);
      });

      dc.addEventListener("open", () => {
        setStatus("live");
        onMetric("connected", performance.now() - startedAtRef.current);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetchWithTimeout(callsEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret.value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!sdpResponse.ok) {
        throw new Error(await sdpResponse.text());
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : `Failed to start ${mode} session.`;
      setError(message);
      stop("error");
    }
  }, [
    callsEndpoint,
    mode,
    onEvent,
    onMetric,
    sessionBody,
    sessionEndpoint,
    status,
    stop,
  ]);

  return { status, error, start, stop };
}

function hasTranscriptDelta(event: RealtimeEvent) {
  return Boolean(
    event.delta &&
      (event.type?.includes("transcript.delta") ||
        event.type?.includes("transcription.delta")),
  );
}

function isTurnDone(event: RealtimeEvent) {
  return Boolean(
    event.type?.includes("transcript.done") ||
      event.type?.includes("transcription.completed") ||
      event.type?.includes("session.output_audio.done"),
  );
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
