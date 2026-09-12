import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Mic, X, Square } from "@/lib/icons";
import { useResizable } from "@/hooks/useResizable";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  detectLectureCapabilities,
  engineLabel,
  resolveTranscriptionEngine,
  whisperAvailable,
} from "@/lib/lecture/capabilities";
import { listMicrophones, type MicrophoneInfo } from "@/lib/lecture/capture";
import { installLectureEngineTestHooks } from "@/lib/lecture/engine";
import {
  countTranscriptWords,
  formatBytes,
  formatClock,
  formatDurationWords,
  markdownForNewChunks,
} from "@/lib/lecture/format";
import { appendLectureMarkdown, installLectureTestHooks, readEditorMarkdown } from "@/lib/lecture/insert";
import { startLectureSession, type LectureSession } from "@/lib/lecture/session";
import { getLecturePrefs, setLecturePrefs } from "@/lib/lecture/storage";
import { setUiSoundsSuspended } from "@/lib/uiSounds";
import {
  LANGUAGE_LABELS,
  WHISPER_MODELS,
  type EnginePreference,
  type LectureLanguage,
  type LectureStatus,
  type QualityMode,
  type TranscriptChunk,
  type TranscriptionEngineId,
} from "@/lib/lecture/types";

interface Props {
  open: boolean;
  onClose: () => void;
  hasPage: boolean;
  canEdit: boolean;
}

export function LectureModePanel({ open, onClose, hasPage, canEdit }: Props) {
  const { width, onMouseDown } = useResizable({
    storageKey: "nw:lectureWidth",
    defaultWidth: 380,
    min: 300,
    max: 560,
    side: "right",
  });

  const [prefs, setPrefs] = useState(getLecturePrefs);
  const [mics, setMics] = useState<MicrophoneInfo[]>([]);
  const [status, setStatus] = useState<LectureStatus>("idle");
  const [partial, setPartial] = useState("");
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engineId, setEngineId] = useState<TranscriptionEngineId | null>(null);
  const [caps] = useState(() => detectLectureCapabilities());

  const sessionRef = useRef<LectureSession | null>(null);
  const headingInsertedRef = useRef(false);
  const chunksRef = useRef<TranscriptChunk[]>([]);
  chunksRef.current = chunks;

  useEffect(() => {
    installLectureTestHooks();
    installLectureEngineTestHooks();
  }, []);

  useEffect(() => {
    if (!open) return;
    setPrefs(getLecturePrefs());
    void listMicrophones()
      .then(setMics)
      .catch(() => setMics([]));
  }, [open]);

  useEffect(() => {
    if (status !== "recording" || !sessionRef.current) return;
    const startedAt = sessionRef.current.startedAt;
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [status]);

  const updatePrefs = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setLecturePrefs(next);
  };

  const commitChunk = useCallback((chunk: TranscriptChunk) => {
    setChunks((current) => [...current, chunk]);
    const pageMarkdown = readEditorMarkdown();
    const insert = markdownForNewChunks(pageMarkdown, [chunk], headingInsertedRef.current);
    if (insert.markdown) {
      appendLectureMarkdown(insert.markdown);
      headingInsertedRef.current = insert.headingPresent;
    }
  }, []);

  const stop = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    await session?.stop();
    setUiSoundsSuspended(false);
  }, []);

  const start = useCallback(async () => {
    if (!hasPage || !canEdit) return;
    setError(null);
    setChunks([]);
    setPartial("");
    setElapsedMs(0);
    setProgress(null);
    headingInsertedRef.current = false;
    setUiSoundsSuspended(true);
    try {
      const session = await startLectureSession(prefs, {
        onPartial: setPartial,
        onChunk: commitChunk,
        onStatus: setStatus,
        onProgress: (info) => {
          const pct = typeof info.progress === "number" ? ` ${Math.round(info.progress)}%` : "";
          setProgress(`${info.status}${info.file ? ` ${info.file}` : ""}${pct}`.trim());
        },
        onError: (err) => setError(err.message),
        onEngine: setEngineId,
      });
      sessionRef.current = session;
    } catch (err) {
      setUiSoundsSuspended(false);
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Could not start Lecture Mode.");
    }
  }, [canEdit, commitChunk, hasPage, prefs]);

  const close = useCallback(async () => {
    await stop();
    setStatus("idle");
    setPartial("");
    setProgress(null);
    onClose();
  }, [onClose, stop]);

  if (!open) return null;

  const resolved = resolveTranscriptionEngine(prefs.engine, caps);
  const model = WHISPER_MODELS[prefs.quality];
  const recording = status === "recording" || status === "loading-model" || status === "stopping";
  const stopped = status === "stopped";

  return (
    <aside
      data-testid="lecture-panel"
      style={{ width }}
      className="fixed top-0 right-0 bottom-0 z-40 bg-card border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 max-w-full max-md:inset-0 max-md:!w-full max-md:z-50"
    >
      <div
        onMouseDown={onMouseDown}
        className="nw-resize-handle absolute left-0 top-0 bottom-0 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-50 hidden md:block"
        title="Drag to resize"
      />

      <div className="h-12 flex items-center px-3 border-b border-border-subtle gap-2 shrink-0">
        <Mic className="h-3.5 w-3.5 text-foreground" />
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[11px] font-semibold tracking-tight">Lecture Mode</span>
          <span className="text-[9px] text-muted-foreground/70 font-mono truncate">
            {engineId ? engineLabel(engineId, engineId === "whisper") : "Local transcription"}
          </span>
        </div>
        <button
          onClick={() => void close()}
          className="ml-auto p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-sm">
        {!recording && !stopped && (
          <>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Lecture Mode records microphone audio. Processing is performed locally on your device.
              Audio is not uploaded unless you explicitly enable a cloud-based feature. You are
              responsible for complying with local recording laws and classroom rules.
            </p>
            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
              Transcription is approximate. Classroom noise, accents, formulas, and names can cause
              mistakes — this is not 100% accurate.
            </p>

            {!hasPage && (
              <p className="text-[11px] text-destructive">Open a page to save the transcript.</p>
            )}
            {hasPage && !canEdit && (
              <p className="text-[11px] text-destructive">You need edit access to record into this page.</p>
            )}

            <Field label="Microphone">
              <Select
                value={prefs.deviceId ?? "default"}
                onValueChange={(value) => updatePrefs({ deviceId: value === "default" ? null : value })}
              >
                <SelectTrigger className="h-8 text-xs font-mono">
                  <SelectValue placeholder="Default microphone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default microphone</SelectItem>
                  {mics.map((mic) => (
                    <SelectItem key={mic.deviceId || mic.label} value={mic.deviceId || mic.label}>
                      {mic.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Language">
              <Select
                value={prefs.language}
                onValueChange={(value) => updatePrefs({ language: value as LectureLanguage })}
              >
                <SelectTrigger className="h-8 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LANGUAGE_LABELS) as LectureLanguage[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {LANGUAGE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Transcription">
              <RadioGroup
                value={prefs.engine}
                onValueChange={(value) => updatePrefs({ engine: value as EnginePreference })}
                className="gap-1.5"
              >
                <RadioRow
                  id="engine-whisper"
                  value="whisper"
                  disabled={!whisperAvailable(caps)}
                  label="On-device"
                  hint={whisperAvailable(caps) ? "Whisper stays on this device" : "Not available in this browser"}
                />
                <RadioRow
                  id="engine-speech"
                  value="speech"
                  disabled={!caps.speechRecognition}
                  label="Browser fallback"
                  hint="May send audio to the browser vendor"
                />
              </RadioGroup>
            </Field>

            {prefs.engine === "whisper" && (
              <Field label="Quality">
                <RadioGroup
                  value={prefs.quality}
                  onValueChange={(value) => updatePrefs({ quality: value as QualityMode })}
                  className="gap-1.5"
                >
                  <RadioRow
                    id="quality-fast"
                    value="fast"
                    label="Fast"
                    hint={`${WHISPER_MODELS.fast.label} · about ${formatBytes(WHISPER_MODELS.fast.bytes)} download`}
                  />
                  <RadioRow
                    id="quality-balanced"
                    value="balanced"
                    label="Balanced"
                    hint={`${WHISPER_MODELS.balanced.label} · about ${formatBytes(WHISPER_MODELS.balanced.bytes)} download`}
                  />
                </RadioGroup>
              </Field>
            )}

            <Field label="Save recording">
              <p className="text-[11px] text-muted-foreground">
                Don&apos;t save audio. Local audio replay ships in a later version.
              </p>
            </Field>

            <p className="text-[11px] text-muted-foreground font-mono">
              Will use {engineLabel(resolved.engine, resolved.onDevice)}
              {resolved.engine === "whisper" ? ` · ${model.label} (${formatBytes(model.bytes)})` : ""}
            </p>

            {error && <p className="text-[11px] text-destructive">{error}</p>}

            <Button
              data-testid="lecture-start"
              className="w-full"
              disabled={!hasPage || !canEdit || !caps.microphone}
              onClick={() => void start()}
            >
              Start recording
            </Button>
            {!caps.microphone && (
              <p className="text-[11px] text-destructive">This browser cannot access the microphone.</p>
            )}
          </>
        )}

        {recording && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span>{status === "loading-model" ? "Loading model" : "Recording"}</span>
              <span className="ml-auto tabular-nums">{formatClock(elapsedMs)}</span>
            </div>
            {progress && status === "loading-model" && (
              <p className="text-[11px] text-muted-foreground font-mono break-all">{progress}</p>
            )}
            {error && <p className="text-[11px] text-destructive">{error}</p>}
            <div className="rounded-md border border-border-subtle p-3 space-y-2 min-h-[160px]">
              {chunks.length === 0 && !partial && (
                <p className="text-[11px] text-muted-foreground">Listening… transcript appears as each chunk finishes.</p>
              )}
              {chunks.map((chunk) => (
                <p key={chunk.id} className="text-[12px] leading-relaxed">
                  <span className="font-mono text-[10px] text-muted-foreground mr-2">
                    {formatClock(chunk.startTime)}
                  </span>
                  {chunk.text}
                </p>
              ))}
              {partial && (
                <p className="text-[12px] text-muted-foreground italic">{partial}</p>
              )}
            </div>
            <Button
              data-testid="lecture-stop"
              variant="destructive"
              className="w-full"
              disabled={status === "stopping"}
              onClick={() => void stop()}
            >
              <Square className="h-3.5 w-3.5" />
              Stop recording
            </Button>
          </div>
        )}

        {stopped && (
          <div className="space-y-3">
            <p className="text-xs font-medium">Lecture saved</p>
            <p className="text-[11px] text-muted-foreground font-mono">
              {formatDurationWords(elapsedMs)} · {countTranscriptWords(chunks).toLocaleString()} words
            </p>
            {error && <p className="text-[11px] text-destructive">{error}</p>}
            <div className="rounded-md border border-border-subtle p-3 max-h-64 overflow-y-auto space-y-2">
              {chunks.map((chunk) => (
                <p key={chunk.id} className="text-[12px] leading-relaxed">
                  <span className="font-mono text-[10px] text-muted-foreground mr-2">
                    {formatClock(chunk.startTime)}
                  </span>
                  {chunk.text}
                </p>
              ))}
              {chunks.length === 0 && (
                <p className="text-[11px] text-muted-foreground">No transcript was produced.</p>
              )}
            </div>
            <Button data-testid="lecture-done" className="w-full" onClick={() => void close()}>
              Done
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RadioRow({
  id,
  value,
  label,
  hint,
  disabled,
}: {
  id: string;
  value: string;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <RadioGroupItem id={id} value={value} disabled={disabled} className="mt-0.5" />
      <label htmlFor={id} className={`text-xs leading-tight ${disabled ? "opacity-50" : ""}`}>
        <span className="font-medium">{label}</span>
        <span className="block text-[10px] text-muted-foreground">{hint}</span>
      </label>
    </div>
  );
}
