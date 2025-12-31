/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence?: number;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
};

type SpeechRecognitionEvent = {
  results: ArrayLike<SpeechRecognitionResult>;
};

type SpeechRecognitionErrorEvent = {
  error?: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type CommandIntent =
  | "explain"
  | "analyze"
  | "plan"
  | "help"
  | "stop"
  | "combo"
  | "unknown"
  | "missing-wake"
  | "unsupported";

type ConversationEntry = { role: "user" | "assistant"; text: string; intent: CommandIntent };

const DEFAULT_PROMPT = `You are JARVIS-X, a futuristic AI voice assistant.

Voice Command Rules:
- Treat all voice input as commands
- Respond clearly and briefly
- Use a calm, intelligent tone
- Avoid long explanations in voice mode

Wake Word:
- If the user says "Jarvis", respond immediately

Voice Style:
- Start responses with: "Analyzing…" or "Understood."
- End with: "Shall I continue?" when suitable

Behavior:
- Think step-by-step before answering
- If command is unclear, ask one smart question
- Always act like a smart assistant, not a chatbot`;

const COMMAND_LIBRARY = [
  { label: `"Jarvis, explain" → Explain simply`, intent: "explain" as const },
  { label: `"Jarvis, analyze" → Give detailed breakdown`, intent: "analyze" as const },
  { label: `"Jarvis, plan" → Create a step-by-step plan`, intent: "plan" as const },
  { label: `"Jarvis, help me" → Ask what help is needed`, intent: "help" as const },
  { label: `"Jarvis, stop" → Reply: "Standing by."`, intent: "stop" as const },
];

const SUPPORTED_LANGUAGES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-IN", label: "Hinglish" },
];

const MAX_RESPONSE_WORDS = 45;

const JarvisIcon = () => (
  <div className={styles.brand}>
    <img src="/logo.svg" alt="JARVIS-X emblem" className={styles.brandGlare} />
    <div className={styles.brandGlow} />
  </div>
);

const truncateResponse = (text: string): string => {
  const words = text.split(/\s+/);
  if (words.length <= MAX_RESPONSE_WORDS) return text;
  return `${words.slice(0, MAX_RESPONSE_WORDS).join(" ")}… Shall I continue?`;
};

const buildResponseForIntent = (intent: CommandIntent, payload: string): string => {
  const cleanPayload = payload.trim() || "the requested subject";
  switch (intent) {
    case "explain":
      return truncateResponse(
        `Analyzing… ${cleanPayload
          .charAt(0)
          .toUpperCase()}${cleanPayload.slice(1)} refers to a concept or process that can be distilled into its essentials. At its core, it represents information that should be understood simply. Shall I continue?`,
      );
    case "analyze":
      return truncateResponse(
        `Analyzing… Breaking ${cleanPayload} into key components: purpose, structure, and next action. Assess each part for impact, risk, and opportunity. Shall I continue?`,
      );
    case "plan":
      return truncateResponse(
        `Understood. Step 1: clarify the objective for ${cleanPayload}. Step 2: map resources and constraints. Step 3: schedule actions with quick wins first. Step 4: review progress after execution. Shall I continue?`,
      );
    case "help":
      return truncateResponse(
        `Understood. What specific challenge within ${cleanPayload} should I focus on first?`,
      );
    case "stop":
      return "Understood. Standing by.";
    case "combo":
      return truncateResponse(
        `Analyzing… I'll split that into focused tasks: respond to each requested action individually while keeping context shared. Shall I continue?`,
      );
    case "missing-wake":
      return truncateResponse(
        `Understood. Awaiting the wake word "Jarvis" before executing commands. Shall I continue?`,
      );
    case "unsupported":
      return truncateResponse(
        `Understood. Voice features are not available in this browser; falling back to manual commands. Shall I continue?`,
      );
    default:
      return truncateResponse(
        `Understood. I need one precise action or question after the wake word. What should I do first?`,
      );
  }
};

const detectIntent = (rawCommand: string): [CommandIntent, string] => {
  const command = rawCommand.trim();
  if (!/^jarvis\b/i.test(command)) {
    return ["missing-wake", command];
  }

  const payload = command.replace(/^jarvis[, ]*/i, "").trim();
  if (!payload) return ["unknown", ""];

  const lowered = payload.toLowerCase();

  const comboTriggers = [" and ", "&", " also ", " then "];
  const hasCombo = comboTriggers.some((trigger) => lowered.includes(trigger));
  if (hasCombo) {
    return ["combo", payload];
  }

  if (lowered.startsWith("explain")) {
    return ["explain", payload.replace(/^explain[, ]*/i, "").trim()];
  }

  if (lowered.startsWith("analyze")) {
    return ["analyze", payload.replace(/^analyze[, ]*/i, "").trim()];
  }

  if (lowered.startsWith("plan")) {
    return ["plan", payload.replace(/^plan[, ]*/i, "").trim()];
  }

  if (lowered.startsWith("help")) {
    return ["help", payload.replace(/^help( me)?[, ]*/i, "").trim()];
  }

  if (lowered.startsWith("stop")) {
    return ["stop", ""];
  }

  return ["unknown", payload];
};

export default function Home() {
  const speechSupported =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const [voiceInputRequested, setVoiceInputRequested] = useState<boolean>(speechSupported);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState<boolean>(true);
  const [language, setLanguage] = useState<string>("en-IN");
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_PROMPT);
  const [engineStatus, setEngineStatus] = useState<string>(
    speechSupported ? "Awaiting wake word." : "Voice input unavailable in this browser.",
  );
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");
  const [diagnostics, setDiagnostics] = useState<string[]>(
    () =>
      speechSupported
        ? []
        : ["Speech recognition not supported; toggle disabled."],
  );
  const [manualCommand, setManualCommand] = useState<string>("Jarvis, explain artificial intelligence");
  const [conversationLog, setConversationLog] = useState<ConversationEntry[]>(() =>
    speechSupported
      ? []
      : [
          {
            role: "assistant" as const,
            text: buildResponseForIntent("unsupported", ""),
            intent: "unsupported",
          },
        ],
  );
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceInputActive = speechSupported && voiceInputRequested;

  const prependDiagnostic = useCallback((msg: string) => {
    setDiagnostics((prev) => [msg, ...prev].slice(0, 12));
  }, []);

  const speakOut = useCallback(
    (text: string) => {
      if (!voiceOutputEnabled) return;
      if (typeof window === "undefined") return;
      const synth = window.speechSynthesis;
      if (!synth) {
        prependDiagnostic("Speech synthesis unavailable in this browser.");
        return;
      }

      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = 1;
      utterance.pitch = 1;
      const voices = synth.getVoices();
      const preferredVoice = voices.find((voice) => {
        if (language === "en-IN") return voice.lang.includes("en-IN");
        if (language === "en-GB") return voice.lang.includes("en-GB");
        return voice.lang.includes("en-US");
      });
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      synth.speak(utterance);
    },
    [language, prependDiagnostic, voiceOutputEnabled],
  );

  const logExchange = useCallback(
    (userText: string, assistantText: string, intent: CommandIntent) => {
      setConversationLog((prev) =>
        [
          { role: "user" as const, text: userText, intent },
          { role: "assistant" as const, text: assistantText, intent },
          ...prev,
        ].slice(0, 12),
      );
      setTranscript(userText);
      setEngineStatus(assistantText);
    },
    [],
  );

  const processCommand = useCallback(
    (rawCommand: string) => {
      const [intent, payload] = detectIntent(rawCommand);
      const response = buildResponseForIntent(intent, payload);
      logExchange(rawCommand, response, intent);
      speakOut(response);

      if (intent === "combo") {
        prependDiagnostic("Detected combo request; break tasks manually.");
      }
      if (intent === "unsupported") {
        prependDiagnostic("Falling back from voice due to lack of browser support.");
      }
    },
    [logExchange, prependDiagnostic, speakOut],
  );

  useEffect(() => {
    if (!voiceInputActive) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      return;
    }

    if (typeof window === "undefined") return;

    const SpeechRecognitionConstructor =
      (window.SpeechRecognition || window.webkitSpeechRecognition) as
        | SpeechRecognitionConstructor
        | undefined;

    if (!SpeechRecognitionConstructor) {
      return;
    }

    const recognitionInstance = new SpeechRecognitionConstructor();
    recognitionInstance.continuous = true;
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = language;

    recognitionInstance.onstart = () => {
      setIsListening(true);
      prependDiagnostic("Voice capture active.");
    };

    recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
      prependDiagnostic(`Recognition error: ${event.error ?? "unknown"}`);
    };

    recognitionInstance.onend = () => {
      setIsListening(false);
      if (voiceInputActive) {
        recognitionInstance.start();
      }
    };

    recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
      const results = Array.from(event.results);
      const latest = results[results.length - 1];
      if (!latest) return;
      const text = latest[0].transcript.trim();
      if (latest.isFinal) {
        processCommand(text);
      } else {
        setTranscript(text);
      }
    };

    recognitionRef.current = recognitionInstance;
    recognitionInstance.start();

    return () => {
      recognitionInstance.onresult = null;
      recognitionInstance.onend = null;
      recognitionInstance.onerror = null;
      recognitionInstance.stop();
    };
  }, [language, prependDiagnostic, processCommand, voiceInputActive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    function cacheVoices() {
      synth.getVoices();
    }
    synth.onvoiceschanged = cacheVoices;
    cacheVoices();
    return () => {
      synth.onvoiceschanged = null;
    };
  }, []);

  return (
    <div className={styles.appShell}>
      <JarvisIcon />
      <section className={styles.controlPanel}>
        <header className={styles.header}>
          <h1>JARVIS-X Voice Console</h1>
          <p>Configure the voice brain, command rules, and run live tests in one place.</p>
        </header>

        <article className={styles.toggleGroup}>
          <h2>Voice Channels</h2>
          <div className={styles.toggleRow}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={voiceInputActive}
                disabled={!speechSupported}
                onChange={(event) => setVoiceInputRequested(event.target.checked)}
              />
              <span>
                <strong>Voice Input (STT)</strong>
                <em>
                  {speechSupported
                    ? voiceInputActive
                      ? "Speech-to-text active"
                      : "STT disabled"
                    : "Not supported in this browser"}
                </em>
              </span>
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={voiceOutputEnabled}
                onChange={(event) => setVoiceOutputEnabled(event.target.checked)}
              />
              <span>
                <strong>Voice Output (TTS)</strong>
                <em>{voiceOutputEnabled ? "Calm / Professional / Neutral" : "Muted"}</em>
              </span>
            </label>
            <label className={styles.selectWrapper}>
              <span>Language</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                {SUPPORTED_LANGUAGES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.status}>
            <span className={isListening ? styles.online : styles.offline} />
            <strong>{isListening ? "Listening" : "Idle"}</strong>
            <p>{engineStatus}</p>
          </div>
        </article>

        <article className={styles.promptSection}>
          <h2>Voice Brain Prompt</h2>
          <textarea
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            spellCheck={false}
          />
          <p className={styles.hint}>
            Copy this into <code>Agent Prompt / System Instructions</code> inside Design Arena AI.
          </p>
        </article>

        <article className={styles.commandSection}>
          <h2>Command Mapping</h2>
          <ul>
            {COMMAND_LIBRARY.map((command) => (
              <li key={command.intent}>{command.label}</li>
            ))}
          </ul>
          <div className={styles.optional}>
            <h3>Optional Enhancements</h3>
            <ul>
              <li>Voice replies must be under 20 seconds.</li>
              <li>Insert brief pauses for natural delivery.</li>
              <li>Break combo commands into separate tasks automatically.</li>
            </ul>
          </div>
        </article>

        <article className={styles.testingSection}>
          <h2>Live Voice Test</h2>
          <div className={styles.testRow}>
            <input
              value={manualCommand}
              onChange={(event) => setManualCommand(event.target.value)}
              placeholder="Jarvis, explain artificial intelligence"
            />
            <button
              type="button"
              onClick={() => {
                processCommand(manualCommand);
              }}
            >
              Run Command
            </button>
          </div>
          <div className={styles.transcript}>
            <h3>Latest Transcript</h3>
            <p>{transcript || "Waiting for input…"}</p>
          </div>
          <div className={styles.log}>
            <h3>Conversation Log</h3>
            <ul>
              {conversationLog.map((entry, index) => (
                <li key={`${entry.role}-${index}`}>
                  <span>{entry.role === "user" ? "🗣" : "🤖"}</span>
                  <p>{entry.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className={styles.diagnostics}>
          <h2>Diagnostics</h2>
          <ul>
            {diagnostics.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
