"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  athleteId: string;
  athleteName: string;
  onClose: () => void;
  onTurnComplete?: (user: string, assistant: string) => void;
  /** If true, opens in first-meeting mode — George speaks first and drives the intake. */
  onboarding?: boolean;
}

type ConnectionState = "idle" | "connecting" | "connected" | "error" | "closed";

interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

export function VoiceMode({ athleteId, athleteName, onClose, onTurnComplete, onboarding }: Props) {
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<"user" | "george" | null>(null);
  const [userLive, setUserLive] = useState("");                // current user utterance (interim)
  const [georgeLive, setGeorgeLive] = useState("");            // current George utterance (interim)
  const [transcript, setTranscript] = useState<Array<{ role: "user" | "george"; text: string }>>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Persist a completed turn (user transcript + assistant transcript)
  const lastPersistedUserRef = useRef("");

  useEffect(() => {
    // React 18 StrictMode double-mounts effects in dev. Without a delay + cancellation
    // token, we'd open two simultaneous WebRTC sessions and hear George twice.
    const cancellation = { cancelled: false };
    const timer = setTimeout(() => {
      if (!cancellation.cancelled) void start(cancellation);
    }, 50);
    return () => {
      cancellation.cancelled = true;
      clearTimeout(timer);
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc to end
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") handleEnd(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start(cancellation: { cancelled: boolean }) {
    setState("connecting");
    setError(null);

    const bailIfCancelled = (): boolean => {
      if (cancellation.cancelled) {
        teardown();
        return true;
      }
      return false;
    };

    try {
      // 1. Mint ephemeral key (with voice persona from Settings, if set)
      const storedVoice = typeof window !== "undefined" ? localStorage.getItem("whatsupp.voice") : null;
      const r = await fetch("/api/george/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          ...(storedVoice ? { voice: storedVoice } : {}),
          ...(onboarding ? { onboarding: true } : {}),
        }),
      });
      if (bailIfCancelled()) return;
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `voice/init ${r.status}`);
      }
      const { clientSecret } = await r.json();
      if (bailIfCancelled()) return;

      // 2. Set up WebRTC peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Remote audio (George's voice)
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioElRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // 3. Mic input
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (bailIfCancelled()) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      localStreamRef.current = stream;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // 4. Data channel for events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as RealtimeEvent;
          handleRealtimeEvent(ev);
        } catch { /* ignore */ }
      };

      // 5. SDP offer/answer with OpenAI
      const offer = await pc.createOffer();
      if (bailIfCancelled()) return;
      await pc.setLocalDescription(offer);
      if (bailIfCancelled()) return;

      // Model + voice are already baked into the ephemeral session — no query needed.
      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (bailIfCancelled()) return;
      if (!sdpRes.ok) {
        const errText = await sdpRes.text().catch(() => "");
        throw new Error(`SDP handshake failed: ${sdpRes.status}${errText ? ` — ${errText.slice(0, 200)}` : ""}`);
      }
      const answerSdp = await sdpRes.text();
      if (bailIfCancelled()) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      if (bailIfCancelled()) return;

      setState("connected");
    } catch (err) {
      if (cancellation.cancelled) return; // expected if user closed mid-handshake
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
      teardown();
    }
  }

  function handleRealtimeEvent(ev: RealtimeEvent) {
    switch (ev.type) {
      // User audio transcription (interim + final)
      case "conversation.item.input_audio_transcription.delta": {
        const delta = (ev.delta as string) ?? "";
        if (delta) setUserLive(prev => prev + delta);
        setSpeaking("user");
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const final = (ev.transcript as string) ?? "";
        if (final) {
          setTranscript(prev => [...prev, { role: "user", text: final }]);
          lastPersistedUserRef.current = final;
        }
        setUserLive("");
        break;
      }

      // Assistant audio response — text deltas come via output transcripts
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        const delta = (ev.delta as string) ?? "";
        if (delta) setGeorgeLive(prev => prev + delta);
        setSpeaking("george");
        break;
      }
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const final = (ev.transcript as string) ?? georgeLiveRef.current;
        if (final) {
          setTranscript(prev => [...prev, { role: "george", text: final }]);
          // Persist the completed turn (user + assistant)
          void persistTurn(lastPersistedUserRef.current, final);
          lastPersistedUserRef.current = "";
          if (onTurnComplete) onTurnComplete(lastPersistedUserRef.current, final);
        }
        setGeorgeLive("");
        break;
      }

      // VAD edges
      case "input_audio_buffer.speech_started":
        setSpeaking("user");
        break;
      case "input_audio_buffer.speech_stopped":
        if (speaking === "user") setSpeaking(null);
        break;
      case "response.created":
        setSpeaking("george");
        break;
      case "response.done":
        setSpeaking(null);
        break;

      case "error":
        setError(typeof ev.error === "string" ? ev.error : JSON.stringify(ev.error ?? ev));
        break;

      default:
        // verbose: console.log("[realtime]", ev.type, ev);
        break;
    }
  }

  // Keep a ref of georgeLive so the done handler can read its current value
  // (since state updates are async).
  const georgeLiveRef = useRef("");
  useEffect(() => { georgeLiveRef.current = georgeLive; }, [georgeLive]);

  async function persistTurn(user: string, assistant: string) {
    if (!user && !assistant) return;
    try {
      await fetch("/api/george/voice/persist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          userTranscript: user || undefined,
          assistantTranscript: assistant || undefined,
        }),
      });
    } catch { /* best effort */ }
  }

  function teardown() {
    try { dcRef.current?.close(); } catch { /* noop */ }
    try { pcRef.current?.close(); } catch { /* noop */ }
    try {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    } catch { /* noop */ }
    if (audioElRef.current) audioElRef.current.srcObject = null;
    dcRef.current = null;
    pcRef.current = null;
    localStreamRef.current = null;
    audioElRef.current = null;
  }

  function handleEnd() {
    teardown();
    setState("closed");
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={handleEnd} aria-hidden />

      {/* Overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-xl bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col">
          {/* Header */}
          <header className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MicVisualizer speaking={speaking} state={state} />
              <div>
                <div className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Voice with George</div>
                <div className="text-xs text-muted">
                  {state === "connecting" && "Connecting…"}
                  {state === "connected" && (speaking === "user" ? `${athleteName} speaking` : speaking === "george" ? "George speaking" : "Listening")}
                  {state === "error" && (error ?? "Error")}
                  {state === "closed" && "Ended"}
                </div>
              </div>
            </div>
            <button
              onClick={handleEnd}
              className="btn-ghost px-3.5 py-1.5 rounded-lg text-xs font-medium"
            >
              End call
            </button>
          </header>

          {/* Transcript */}
          <div className="flex-1 max-h-[60vh] overflow-y-auto px-6 py-5 space-y-4">
            {state === "connecting" && (
              <div className="text-sm text-muted">Setting up microphone and connecting to George…</div>
            )}
            {state === "error" && (
              <div className="text-sm text-confidence-low bg-confidence-low/5 border border-confidence-low/20 rounded-md px-3 py-2">
                {error ?? "Voice session failed."}
              </div>
            )}

            {transcript.map((t, i) => (
              <TranscriptLine key={i} role={t.role} text={t.text} live={false} />
            ))}
            {userLive && <TranscriptLine role="user" text={userLive} live />}
            {georgeLive && <TranscriptLine role="george" text={georgeLive} live />}

            {state === "connected" && transcript.length === 0 && !userLive && !georgeLive && (
              <div className="text-sm text-muted">Say hello to start. George will respond when you finish speaking.</div>
            )}
          </div>

          <div className="px-6 py-3 border-t border-border text-[11px] text-muted">
            Voice runs on OpenAI Realtime · grounded on the same Vault as text George · Esc to end
          </div>
        </div>
      </div>
    </>
  );
}

function TranscriptLine({ role, text, live }: { role: "user" | "george"; text: string; live: boolean }) {
  return (
    <div>
      <div
        className={["text-[9.5px] uppercase tracking-[0.16em] mb-0.5", role === "george" ? "text-lime" : "text-cyan"].join(" ")}
        style={{ fontFamily: "var(--font-mono-deck)" }}
      >
        {role === "user" ? "You" : "George"} {live && <span className="text-muted">· live</span>}
      </div>
      <div className={["text-sm leading-relaxed whitespace-pre-wrap", role === "george" ? "text-foreground" : "text-foreground/80"].join(" ")}>
        {text}
      </div>
    </div>
  );
}

function MicVisualizer({ speaking, state }: { speaking: "user" | "george" | null; state: ConnectionState }) {
  const active = state === "connected";
  const color =
    state === "error" ? "bg-confidence-low" :
    !active ? "bg-muted/40" :
    speaking === "user" ? "bg-cyan" :
    speaking === "george" ? "bg-lime" :
    "bg-muted/60";
  return (
    <div className="relative w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center">
      <div className={["w-3 h-3 rounded-full", color, speaking ? "animate-pulse" : ""].join(" ")} />
      {speaking && <div className={["absolute inset-0 rounded-full border-2", speaking === "user" ? "border-cyan/40" : "border-lime/40", "animate-ping"].join(" ")} />}
    </div>
  );
}
