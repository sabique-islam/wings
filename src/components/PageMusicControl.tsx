import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Music, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MUSIC_GROUPS, catalogTrackById, catalogTracksInGroup } from "@/lib/pageMusic/catalog";
import { audioFileError } from "@/lib/pageMusic/audioFile";
import { readLocalPageAudio } from "@/lib/pageMusic/localAudio";
import {
  isLocalAudioPath,
  pageSongKey,
  pageSongTitle,
  playbackOnPageChange,
  type PageSong,
} from "@/lib/pageMusic/pageSong";
import { pageAudioUrl } from "@/lib/pageMusic/upload";

type NowPlaying = { key: string; song: PageSong };

type PageMusicContextValue = {
  nowKey: string | null;
  playing: boolean;
  play: (song: PageSong) => void;
};

const PageMusicContext = createContext<PageMusicContextValue | null>(null);

async function resolveSongUrl(song: PageSong): Promise<string | null> {
  if (song.source === "catalog") return catalogTrackById(song.id)?.src ?? null;
  if (isLocalAudioPath(song.path)) {
    const blob = await readLocalPageAudio(song.path.slice("local:".length));
    return blob ? URL.createObjectURL(blob) : null;
  }
  return pageAudioUrl(song.path);
}

export function PageMusicProvider({
  focusedEntryId,
  focusedSong,
  children,
}: {
  focusedEntryId: string | null;
  focusedSong: PageSong | null;
  children: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const nowRef = useRef<NowPlaying | null>(null);
  const playingRef = useRef(false);
  const focusedSongRef = useRef(focusedSong);
  focusedSongRef.current = focusedSong;
  const focusedKey = pageSongKey(focusedSong);
  const [nowKey, setNowKey] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;
    const onPlay = () => {
      playingRef.current = true;
      setPlaying(true);
    };
    const onPause = () => {
      playingRef.current = false;
      setPlaying(false);
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const stop = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    nowRef.current = null;
    playingRef.current = false;
    setNowKey(null);
    setPlaying(false);
    setPromptOpen(false);
  };

  const play = (song: PageSong) => {
    const key = pageSongKey(song);
    const audio = audioRef.current;
    if (!key || !audio) return;
    setPromptOpen(false);
    if (nowRef.current?.key === key) {
      if (audio.paused) void audio.play().catch(() => toast.error("Couldn't play that song"));
      else audio.pause();
      return;
    }
    void (async () => {
      const url = await resolveSongUrl(song);
      if (!url) {
        toast.error("Couldn't play that song");
        return;
      }
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = url.startsWith("blob:") ? url : null;
      audio.src = url;
      nowRef.current = { key, song };
      setNowKey(key);
      try {
        await audio.play();
      } catch {
        toast.error("Couldn't play that song");
      }
    })();
  };

  useEffect(() => {
    const decision = playbackOnPageChange({
      playing: playingRef.current,
      currentKey: nowRef.current?.key ?? null,
      nextSong: focusedSongRef.current,
    });
    setPromptOpen(decision === "ask");
  }, [focusedEntryId, focusedKey]);

  return (
    <PageMusicContext.Provider value={{ nowKey, playing, play }}>
      {children}
      <AlertDialog open={promptOpen} onOpenChange={(open) => { if (!open) setPromptOpen(false); }}>
        <AlertDialogContent className="w-[min(32rem,calc(100vw-2rem))]">
          <AlertDialogHeader>
            <AlertDialogTitle>Keep this song playing?</AlertDialogTitle>
            <AlertDialogDescription>
              This page has its own song. You can keep the current track going, or turn it off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="page-music-continue" onClick={() => setPromptOpen(false)}>
              Continue playing
            </AlertDialogCancel>
            <AlertDialogAction data-testid="page-music-stop" onClick={stop}>
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageMusicContext.Provider>
  );
}

function SoundWaves() {
  return (
    <svg className="page-music-waves shrink-0" viewBox="0 0 32 12" aria-hidden="true" data-testid="page-music-waves">
      <g className="page-music-wave">
        <path d="M0 6 Q4 1 8 6 T16 6 T24 6 T32 6 T40 6 T48 6" fill="none" stroke="currentColor" strokeWidth="1.25" />
      </g>
      <g className="page-music-wave page-music-wave-soft" opacity="0.55">
        <path d="M0 7 Q4 11 8 7 T16 7 T24 7 T32 7 T40 7 T48 7" fill="none" stroke="currentColor" strokeWidth="1.25" />
      </g>
    </svg>
  );
}

export function PageMusicControl({
  song,
  canChoose,
  onChange,
  onUpload,
}: {
  song: PageSong | null;
  canChoose: boolean;
  onChange: (song: PageSong | null) => void;
  onUpload: (file: File) => void;
}) {
  const music = useContext(PageMusicContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const key = pageSongKey(song);
  const active = Boolean(music && key && music.nowKey === key && music.playing);

  return (
    <div className="flex shrink-0 items-center gap-0.5" data-testid="page-music">
      <button
        type="button"
        data-testid="page-music-play"
        disabled={!song}
        onClick={() => song && music?.play(song)}
        className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        title={song ? (active ? `Pause ${pageSongTitle(song)}` : `Play ${pageSongTitle(song)}`) : "Choose a song first"}
        aria-label={song ? (active ? `Pause ${pageSongTitle(song)}` : `Play ${pageSongTitle(song)}`) : "Choose a song first"}
      >
        {active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      {active && <SoundWaves />}
      <span className="page-music-title max-w-[6rem] truncate text-[10px] text-muted-foreground" title={pageSongTitle(song)}>
        {pageSongTitle(song)}
      </span>
      {canChoose && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Choose page song"
              title="Choose page song"
            >
              <Music className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-[min(14rem,calc(100vw-2rem))] overflow-y-auto font-mono text-xs">
              {MUSIC_GROUPS.map((group) => {
                const tracks = catalogTracksInGroup(group.id);
                return (
                  <DropdownMenuGroup key={group.id}>
                    <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                    {tracks.length === 0 ? (
                      <DropdownMenuItem disabled>No tracks yet</DropdownMenuItem>
                    ) : (
                      tracks.map((track) => (
                        <DropdownMenuItem
                          key={track.id}
                          onSelect={() => onChange({ source: "catalog", id: track.id })}
                        >
                          {track.title}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuGroup>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => inputRef.current?.click()}>Upload audio</DropdownMenuItem>
              {song && <DropdownMenuItem onSelect={() => onChange(null)}>Clear song</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={inputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/wave,audio/ogg,audio/mp4,audio/x-m4a,.mp3,.wav,.ogg,.m4a"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const rejected = audioFileError(file);
              if (rejected) {
                toast.error(rejected);
                return;
              }
              onUpload(file);
            }}
          />
        </>
      )}
    </div>
  );
}
