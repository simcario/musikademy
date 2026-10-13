"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  ChevronDown,
  Loader2,
  Maximize2,
  Music,
  NotebookText,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Markdown } from "@/components/shared/markdown";
import { cn } from "@/lib/utils";
import { materialService } from "@/services/materialService";
import type { Material, WithId } from "@/types";
import { errorMessage } from "@/utils/errors";
import { formatDuration } from "@/utils/format";
import { CATEGORY_META } from "@/utils/status";
import { useAudioPlayer, type AudioControls } from "./use-audio-player";

interface AudioDockValue extends AudioControls {
  track: WithId<Material> | null;
  playMaterial: (m: WithId<Material>) => Promise<void>;
  isCurrent: (id: string) => boolean;
  /** Player a tutto schermo (con il testo del brano, se c'è). */
  expanded: boolean;
  setExpanded: (open: boolean) => void;
  /** Apre il player a tutto schermo su questa traccia, avviandola se non è già quella in ascolto. */
  openFull: (m: WithId<Material>) => void;
}

const AudioDockContext = createContext<AudioDockValue | null>(null);

/**
 * Un solo player per l'app: la riproduzione continua cambiando pagina. Avviato un brano compare
 * il dock in basso, che si può massimizzare a tutto schermo.
 */
export function AudioDockProvider({ children }: { children: React.ReactNode }) {
  const player = useAudioPlayer();
  const [track, setTrack] = useState<WithId<Material> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { load, toggle } = player;

  const playMaterial = useCallback(
    async (m: WithId<Material>) => {
      if (track?.id === m.id) return toggle();
      try {
        setTrack(m);
        const url = await materialService.fileUrl(m);
        await load(url);
      } catch (e) {
        setTrack(null);
        setExpanded(false);
        toast.error(errorMessage(e, "Impossibile riprodurre la traccia."));
      }
    },
    [track?.id, load, toggle],
  );

  const openFull = useCallback(
    (m: WithId<Material>) => {
      setExpanded(true);
      if (track?.id !== m.id) void playMaterial(m);
    },
    [track?.id, playMaterial],
  );

  const stop = player.stop;
  const close = useCallback(() => {
    stop();
    setTrack(null);
    setExpanded(false);
  }, [stop]);

  const value = useMemo<AudioDockValue>(
    () => ({
      ...player,
      stop: close,
      track,
      playMaterial,
      isCurrent: (id: string) => track?.id === id,
      expanded,
      setExpanded,
      openFull,
    }),
    [player, close, track, playMaterial, expanded, openFull],
  );

  return (
    <AudioDockContext.Provider value={value}>
      {children}
      <AudioDock />
      <FullPlayer />
    </AudioDockContext.Provider>
  );
}

export function useAudioDock() {
  const ctx = useContext(AudioDockContext);
  if (!ctx) throw new Error("useAudioDock richiede <AudioDockProvider>");
  return ctx;
}

// ─────────────────────────── UI ───────────────────────────

function Waveform({ progress, bars = 36 }: { progress: number; bars?: number }) {
  // Forma d'onda decorativa deterministica (non analizza l'audio).
  const heights = useMemo(
    () => Array.from({ length: bars }, (_, i) => 30 + Math.round(Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) * 70)),
    [bars],
  );
  return (
    <div className="flex h-10 items-center gap-[3px]" aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-full", i / bars < progress ? "bg-primary" : "bg-surface-highest")}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function SeekBar({ className }: { className?: string }) {
  const { state, seek } = useAudioDock();
  return (
    <input
      type="range"
      min={0}
      max={state.duration || 0}
      step={0.1}
      value={Math.min(state.currentTime, state.duration || 0)}
      onChange={(e) => seek(Number(e.target.value))}
      aria-label="Posizione di riproduzione"
      aria-valuetext={`${formatDuration(state.currentTime)} di ${formatDuration(state.duration)}`}
      className={cn("h-2 w-full cursor-pointer accent-primary", className)}
      disabled={!state.duration}
    />
  );
}

function IconBtn({ label, onClick, children, active, className }: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-high hover:text-brand-ink",
        active && "text-brand-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

function PlayButton({ size = "md" }: { size?: "md" | "lg" }) {
  const { state, toggle } = useAudioDock();
  const dim = size === "lg" ? "size-14" : "size-11";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={state.playing ? "Pausa" : "Riproduci"}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:bg-brand-hover active:scale-95",
        dim,
      )}
    >
      {state.loading ? (
        <Loader2 className="size-6 animate-spin" aria-hidden />
      ) : state.playing ? (
        <Pause className="size-6 fill-current" aria-hidden />
      ) : (
        <Play className="size-6 translate-x-px fill-current" aria-hidden />
      )}
    </button>
  );
}

/** Player a tutto schermo: comandi completi e, se la traccia ne ha uno, il testo del brano. */
function FullPlayer() {
  const dock = useAudioDock();
  const { track, state } = dock;
  if (!track) return null;
  const progress = state.duration ? state.currentTime / state.duration : 0;
  return (
    <Dialog open={dock.expanded} onOpenChange={dock.setExpanded}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 ring-0 sm:max-w-none data-open:zoom-in-100 data-closed:zoom-out-100"
      >
        <header className="pt-safe shrink-0 border-b border-border bg-popover">
          <div className="flex items-center gap-2 px-2 py-2">
            <IconBtn label="Riduci player" onClick={() => dock.setExpanded(false)}>
              <ChevronDown className="size-6" aria-hidden />
            </IconBtn>
            <div className="min-w-0 flex-1">
              <p className="section-label flex items-center gap-1.5 text-brand-ink">
                In riproduzione {state.playing && <span className="size-1.5 rounded-full bg-success" aria-hidden />}
              </p>
              <DialogTitle className="truncate text-lg font-semibold">{track.title}</DialogTitle>
              <DialogDescription className="truncate text-sm">
                {track.description || CATEGORY_META[track.category].label}
              </DialogDescription>
            </div>
            <IconBtn label="Chiudi player" onClick={dock.stop}>
              <X className="size-5" aria-hidden />
            </IconBtn>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-low">
          {track.lyrics ? (
            <article aria-label="Testo del brano" className="mx-auto max-w-2xl px-5 py-6 text-lg">
              <Markdown>{track.lyrics}</Markdown>
            </article>
          ) : (
            <div className="flex h-full min-h-40 flex-col items-center justify-center gap-4 p-6 text-center">
              <span className="flex size-28 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-card-hover">
                <Music className="size-12" aria-hidden />
              </span>
              <p className="text-sm text-muted-foreground">Questa traccia non ha un testo.</p>
            </div>
          )}
        </div>

        <footer className="pb-safe shrink-0 border-t border-border bg-popover">
          <div className="mx-auto max-w-2xl space-y-3 px-4 py-3">
            <Waveform progress={progress} />
            <SeekBar />
            <div className="flex justify-between text-xs font-medium text-muted-foreground tabular-nums">
              <span>{formatDuration(state.currentTime)}</span>
              <span>{formatDuration(state.duration)}</span>
            </div>
            {state.error && (
              <p role="alert" className="text-sm text-danger">
                Impossibile riprodurre il file audio.
              </p>
            )}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={dock.cycleRate}
                aria-label={`Velocità di riproduzione ${state.rate}x`}
                className="h-9 min-w-12 rounded-lg bg-surface-mid px-2 text-xs font-semibold text-muted-foreground hover:text-brand-ink"
              >
                {state.rate.toFixed(state.rate === 1 ? 1 : 2)}x
              </button>
              <IconBtn label="Ripeti" onClick={dock.toggleLoop} active={state.loop}>
                <Repeat className="size-5" aria-hidden />
              </IconBtn>
              <IconBtn label="Indietro 10 secondi" onClick={() => dock.skip(-10)}>
                <RotateCcw className="size-5" aria-hidden />
              </IconBtn>
              <PlayButton size="lg" />
              <IconBtn label="Avanti 10 secondi" onClick={() => dock.skip(10)}>
                <RotateCw className="size-5" aria-hidden />
              </IconBtn>
              <VolumeControl />
            </div>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function VolumeControl() {
  const { state, toggleMute, setVolume } = useAudioDock();
  return (
    <div className="relative flex items-center">
      <IconBtn label={state.muted ? "Riattiva audio" : "Disattiva audio"} onClick={toggleMute} active={state.muted}>
        {state.muted || state.volume === 0 ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
      </IconBtn>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={state.muted ? 0 : state.volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Volume"
        className="hidden h-2 w-20 accent-primary sm:block"
      />
    </div>
  );
}

/** Dock compatto: sopra la bottom nav su mobile, in basso a destra su desktop. */
function AudioDock() {
  const dock = useAudioDock();
  const { track, state } = dock;
  if (!track || dock.expanded) return null;
  return (
    <div
      role="region"
      aria-label="Player audio"
      className="glass fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-border shadow-dock md:inset-x-auto md:right-6 md:bottom-6 md:w-[26rem]"
    >
      <div className="flex items-center gap-2 p-2.5">
        <PlayButton />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => dock.setExpanded(true)}
              className="flex min-w-0 items-center gap-1 font-semibold hover:text-brand-ink"
              title={track.lyrics ? "Apri il player con il testo" : "Apri il player a tutto schermo"}
            >
              {track.lyrics && <NotebookText className="size-3.5 shrink-0 text-brand-ink" aria-hidden />}
              <span className="truncate">{track.title}</span>
            </button>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {formatDuration(state.currentTime)} / {formatDuration(state.duration)}
            </span>
          </div>
          <SeekBar />
        </div>
        <button
          type="button"
          onClick={dock.cycleRate}
          aria-label={`Velocità ${state.rate}x`}
          className="hidden h-8 rounded-md bg-surface-mid px-2 text-xs font-semibold text-muted-foreground sm:block"
        >
          {state.rate}x
        </button>
        <IconBtn label="Ingrandisci player" onClick={() => dock.setExpanded(true)} className="size-9">
          <Maximize2 className="size-4" aria-hidden />
        </IconBtn>
        <IconBtn label="Chiudi player" onClick={dock.stop} className="size-9">
          <X className="size-4" aria-hidden />
        </IconBtn>
      </div>
    </div>
  );
}
