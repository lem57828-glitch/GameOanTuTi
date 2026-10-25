import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type SoundKind = 'hover' | 'press';
interface SoundAPI {
  enabled: boolean;
  available: boolean;
  volume: number;
  error: string;
  toggle: () => void;
  setVolume: (n: number) => void;
}
const SoundContext = createContext<SoundAPI>({
  enabled: false,
  available: false,
  volume: 0.2,
  error: '',
  toggle: () => undefined,
  setVolume: () => undefined,
});
export function useInterfaceSound() {
  return useContext(SoundContext);
}
const volumeKey = 'bot-arena:interface-volume';

/** Tiny locally synthesized UI tones. No audio is fetched, recorded or sent anywhere. */
export function InterfaceSoundProvider({ children }: { children: ReactNode }) {
  const context = useRef<AudioContext | null>(null);
  const active = useRef(false);
  const voices = useRef(new Set<OscillatorNode>());
  const last = useRef({ hover: 0, press: 0 });
  const pending = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const AudioCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const available = Boolean(AudioCtor);
  const [volume, updateVolume] = useState(() => {
    try {
      const value = localStorage.getItem(volumeKey);
      const n = value === null ? 0.2 : Number(value);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.2;
    } catch {
      return 0.2;
    }
  });
  const volumeRef = useRef(volume);
  const stop = useCallback(() => {
    for (const voice of voices.current) {
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
    }
    voices.current.clear();
  }, []);
  const play = useCallback((kind: SoundKind) => {
    const audio = context.current;
    if (!active.current || !audio || audio.state !== 'running' || document.hidden || volumeRef.current <= 0)
      return;
    const now = performance.now();
    if (now - last.current[kind] < (kind === 'hover' ? 130 : 70) || voices.current.size >= 2) return;
    last.current[kind] = now;
    const oscillator = audio.createOscillator(),
      envelope = audio.createGain();
    oscillator.type = 'sine';
    const start = audio.currentTime,
      length = kind === 'hover' ? 0.035 : 0.065;
    oscillator.frequency.setValueAtTime(kind === 'hover' ? 1050 : 680, start);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'hover' ? 760 : 960, start + length);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, volumeRef.current * 0.09), start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(envelope);
    envelope.connect(audio.destination);
    voices.current.add(oscillator);
    oscillator.onended = () => {
      voices.current.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + length + 0.01);
  }, []);
  const toggle = useCallback(async () => {
    if (pending.current) return;
    if (active.current) {
      active.current = false;
      setEnabled(false);
      stop();
      void context.current?.suspend().catch(() => undefined);
      return;
    }
    if (!AudioCtor) {
      setError('Trình duyệt này chưa hỗ trợ âm thanh tương tác.');
      return;
    }
    pending.current = true;
    try {
      const audio = context.current ?? new AudioCtor();
      context.current = audio;
      await audio.resume();
      if (audio.state !== 'running') throw new Error('suspended');
      active.current = true;
      setEnabled(true);
      setError('');
      play('press');
    } catch {
      active.current = false;
      setEnabled(false);
      setError('Chưa bật được âm thanh. Hãy bấm lại nút Bật âm thanh.');
    } finally {
      pending.current = false;
    }
  }, [AudioCtor, play, stop]);
  const setVolume = useCallback(
    (n: number) => {
      const next = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.2;
      volumeRef.current = next;
      updateVolume(next);
      try {
        localStorage.setItem(volumeKey, String(next));
      } catch {
        /* Session volume still works. */
      }
      if (!next) stop();
    },
    [stop],
  );
  useEffect(() => {
    const target = (event: Event) =>
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-ui-sound]') : null;
    const allowed = (node: HTMLElement | null) =>
      Boolean(node && !node.matches(':disabled,[aria-disabled="true"]') && !node.closest('[inert],[hidden]'));
    const hover = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const node = target(event);
      if (!allowed(node) || (event.relatedTarget instanceof Node && node?.contains(event.relatedTarget)))
        return;
      play('hover');
    };
    const focus = (event: FocusEvent) => {
      const node = target(event);
      if (allowed(node) && node?.matches(':focus-visible')) play('hover');
    };
    const press = (event: MouseEvent) => {
      if (allowed(target(event))) play('press');
    };
    const visibility = () => {
      if (document.hidden) {
        stop();
        void context.current?.suspend().catch(() => undefined);
      } else if (active.current) {
        void context.current?.resume().catch(() => {
          active.current = false;
          setEnabled(false);
        });
      }
    };
    document.addEventListener('pointerover', hover, { passive: true });
    document.addEventListener('focusin', focus);
    document.addEventListener('click', press);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('pointerover', hover);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('click', press);
      document.removeEventListener('visibilitychange', visibility);
      stop();
      void context.current?.close().catch(() => undefined);
      context.current = null;
    };
  }, [play, stop]);
  const value = useMemo(
    () => ({
      enabled,
      available,
      volume,
      error,
      toggle: () => {
        void toggle();
      },
      setVolume,
    }),
    [enabled, available, volume, error, toggle, setVolume],
  );
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function SoundSettings({ compact = false }: { compact?: boolean }) {
  const sound = useInterfaceSound();
  const id = useId();
  return (
    <div className={`sound-settings${compact ? ' sound-settings--compact' : ''}`}>
      <button
        type="button"
        className="sound-toggle"
        onClick={sound.toggle}
        disabled={!sound.available}
        aria-pressed={sound.enabled}
      >
        <svg
          className="ui-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M4 9h4l5-4v14l-5-4H4z" />
          {sound.enabled ? <path d="M16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" /> : <path d="m17 9 5 6m0-6-5 6" />}
        </svg>
        <span>
          {!sound.available ? 'Âm thanh chưa được hỗ trợ' : sound.enabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
        </span>
      </button>
      {sound.enabled && (
        <label htmlFor={id} className="sound-volume">
          <span>Âm lượng</span>
          <input
            id={id}
            type="range"
            min="0"
            max="100"
            step="5"
            value={Math.round(sound.volume * 100)}
            onChange={(event) => sound.setVolume(Number(event.target.value) / 100)}
          />
          <output htmlFor={id}>{Math.round(sound.volume * 100)}%</output>
        </label>
      )}
      {sound.error && (
        <p className="sound-error" role="status">
          {sound.error}
        </p>
      )}
    </div>
  );
}
