"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Loader2, Pause, Play, Repeat, RotateCcw, RotateCw, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
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
  /** Il player completo registra la propria presenza: il dock compatto si nasconde. */
  registerFullPlayer: () => () => void;
  fullPlayerVisible: boolean;
}

const AudioDockContext = createContext<AudioDockValue | null>(null);

/** Un solo player per l'app: la riproduzione continua cambiando pagina (dock persistente). */
export function AudioDockProvider({ children }: { children: React.ReactNode }) {
  const player = useAudioPlayer();
  const [track, setTrack] = useState<WithId<Material> | null>(null);
  const [fullPlayers, setFullPlayers] = useState(0);
  const { load, toggle } = player;
  const registerFullPlayer = useCallback(() => {
    setFullPlayers((n) => n + 1);
    return () => setFullPlayers((n) => n - 1);
  }, []);

  const playMaterial = useCallback(
    async (m: WithId<Material>) => {
      if (track?.id === m.id) return toggle();
      try {
        setTrack(m);
        const url = await materialService.fileUrl(m);
        await load(url);
      } catch (e) {
        setTrack(null);
        toast.error(errorMessage(e, "Impossibile riprodurre la traccia."));
      }
    },
    [track?.id, load, toggle],
  );

  const stop = player.stop;
  const close = useCallback(() => {
    stop();
    setTrack(null);
  }, [stop]);

  const value = useMemo<AudioDockValue>(
    () => ({
      ...player,
      stop: close,
      track,
      playMaterial,
      isCurrent: (id: string) => track?.id === id,
      registerFullPlayer,
      fullPlayerVisible: fullPlayers > 0,
    }),
    [player, close, track, playMaterial, registerFullPlayer, fullPlayers],
  );

  return (
    <AudioDockContext.Provider value={value}>
      {children}
      <AudioDock />
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

/** Player completo ("In riproduzione") per la libreria materiali. */
export function NowPlayingCard() {
  const dock = useAudioDock();
  const { track, state, registerFullPlayer } = dock;
  useEffect(() => registerFullPlayer(), [registerFullPlayer]);
  if (!track) return null;
  const progress = state.duration ? state.currentTime / state.duration : 0;
  return (
    <section aria-label="Player audio" className="card-surface space-y-3 bg-gradient-to-b from-surface-low to-card p-4 shadow-card-hover">
      <div className="flex items-start gap-3">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Volume2 className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="section-label flex items-center gap-1.5 text-brand-ink">
            In riproduzione {state.playing && <span className="size-1.5 rounded-full bg-success" aria-hidden />}
          </p>
          <h2 className="truncate text-lg font-semibold">{track.title}</h2>
          <p className="truncate text-sm text-muted-foreground">
            {track.description || CATEGORY_META[track.category].label}
          </p>
        </div>
        <IconBtn label="Chiudi player" onClick={dock.stop}>
          <X className="size-5" aria-hidden />
        </IconBtn>
      </div>
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
    </section>
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
  if (!track || dock.fullPlayerVisible) return null;
  return (
    <div
      role="region"
      aria-label="Player audio"
      className="glass fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-border shadow-dock md:inset-x-auto md:right-6 md:bottom-6 md:w-96"
    >
      <div className="flex items-center gap-3 p-2.5">
        <PlayButton />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-semibold">{track.title}</span>
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
          className="h-8 rounded-md bg-surface-mid px-2 text-xs font-semibold text-muted-foreground"
        >
          {state.rate}x
        </button>
        <IconBtn label="Chiudi player" onClick={dock.stop} className="size-9">
          <X className="size-4" aria-hidden />
        </IconBtn>
      </div>
    </div>
  );
}
