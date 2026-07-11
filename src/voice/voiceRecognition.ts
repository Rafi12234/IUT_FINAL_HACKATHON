/**
 * Microphone + Web Speech API wrapper (free, in-browser — no paid STT).
 * DOM-facing only: emits transcripts and status to the host; it knows nothing
 * about robots or commands.
 */

// ---- minimal ambient types (Web Speech API is not in lib.dom yet) ----------
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && getRecognitionCtor() !== null;
}

export interface VoiceRecognitionEvents {
  /** Live (interim) transcript while the user is speaking. */
  onInterim?: (text: string) => void;
  /** Final transcript for one utterance. */
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onStateChange?: (listening: boolean) => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed':
    'Microphone access was denied. Click the lock/mic icon in the address bar and allow microphone use, then try again.',
  'service-not-allowed':
    'The browser refused to use its speech service. This usually happens in embedded/webview browsers (e.g. the VS Code Simple Browser). Open the app in real Chrome or Edge instead.',
  'no-speech': 'No speech was detected — try again a little louder or closer to the microphone.',
  'audio-capture': 'No microphone was found. Check the operating-system audio input device.',
  network:
    'The browser could not reach its speech-to-text service. Common causes: running inside an embedded webview (e.g. VS Code Simple Browser), a VPN or adblocker blocking speech.googleapis.com / www.google.com, or being offline. Open the app in a full Chrome or Edge window on a normal network.',
  aborted: 'Listening stopped.',
};

export class VoiceRecognition {
  private recognition: SpeechRecognitionLike | null = null;
  private listening = false;
  /** True while an utterance is still being spoken — protects against the
   *  browser silently ending recognition (e.g. transient network hiccup). */
  private wantListening = false;
  private errored = false;
  private readonly events: VoiceRecognitionEvents;

  constructor(events: VoiceRecognitionEvents) {
    this.events = events;
  }

  isListening(): boolean {
    return this.listening;
  }

  start(lang = 'en-US'): void {
    if (this.listening) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      this.events.onError?.(
        'Speech recognition is not supported in this browser. Open the app in Chrome or Edge (a full browser window, not the VS Code Simple Browser).',
      );
      return;
    }
    this.errored = false;
    this.wantListening = true;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const text = res[0]?.transcript ?? '';
        if (res.isFinal) {
          const finalText = text.trim();
          if (finalText) this.events.onFinal(finalText);
        } else {
          interim += text;
        }
      }
      if (interim) this.events.onInterim?.(interim.trim());
    };
    rec.onerror = (e) => {
      this.errored = true;
      this.wantListening = false;
      this.events.onError?.(ERROR_MESSAGES[e.error] ?? `Speech error: ${e.error}`);
    };
    rec.onend = () => {
      // Chromium ends recognition after silence even in continuous mode; if
      // the operator hasn't clicked Stop and no error occurred, restart.
      if (this.wantListening && !this.errored) {
        try {
          rec.start();
          return;
        } catch {
          // fall through and report the state change
        }
      }
      this.listening = false;
      this.events.onStateChange?.(false);
    };
    this.recognition = rec;
    try {
      rec.start();
    } catch (err) {
      this.wantListening = false;
      this.events.onError?.(
        err instanceof Error ? err.message : 'Speech recognition could not start.',
      );
      return;
    }
    this.listening = true;
    this.events.onStateChange?.(true);
  }

  stop(): void {
    this.wantListening = false;
    this.recognition?.stop();
    this.listening = false;
    this.events.onStateChange?.(false);
  }

  dispose(): void {
    this.wantListening = false;
    this.recognition?.abort();
    this.recognition = null;
    this.listening = false;
  }
}
