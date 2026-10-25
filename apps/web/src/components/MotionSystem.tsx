import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'bot-arena:motion-paused';
interface MotionPreference {
  enabled: boolean;
  ledEnabled: boolean;
  paused: boolean;
  systemReduced: boolean;
  toggle: () => void;
}
const MotionContext = createContext<MotionPreference>({
  enabled: false,
  ledEnabled: false,
  paused: false,
  systemReduced: false,
  toggle: () => undefined,
});
export function useArenaMotion() {
  return useContext(MotionContext);
}

export function MotionProvider({ children }: { children: ReactNode }) {
  // Không có lựa chọn: theo thiết bị. "false" là người dùng chủ động bật lại LED.
  const readPreference = (value: string | null) =>
    value === 'true' ? 'paused' : value === 'false' ? 'running' : 'system';
  const [preference, setPreference] = useState(() => {
    try {
      return readPreference(localStorage.getItem(STORAGE_KEY));
    } catch {
      return 'system';
    }
  });
  const [systemReduced, setSystemReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches);
    const storage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null)
        setPreference(readPreference(event.key === null ? null : event.newValue));
    };
    update();
    media.addEventListener('change', update);
    window.addEventListener('storage', storage);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('storage', storage);
    };
  }, []);
  const paused = preference === 'paused';
  const enabled = !paused && !systemReduced;
  const ledEnabled = true;
  const value = useMemo<MotionPreference>(
    () => ({
      enabled,
      ledEnabled,
      paused,
      systemReduced,
      toggle: () =>
        setPreference((prev) => {
          const next = prev === 'paused' ? 'running' : 'paused';
          try {
            localStorage.setItem(STORAGE_KEY, String(next === 'paused'));
          } catch {
            /* In-memory preference still works. */
          }
          return next;
        }),
    }),
    [enabled, ledEnabled, paused, systemReduced],
  );
  return (
    <MotionContext.Provider value={value}>
      <MotionRuntime enabled={enabled} />
      {children}
    </MotionContext.Provider>
  );
}

const REVEAL = [
  '.sector-hero',
  '.sector-art',
  '.bot-process',
  '.team-roster-card',
  '.roster-member',
  '.stage-journey',
  '.tournament-calendar',
  '.stage-detail-card',
  '.leader-strip',
  '.finalists',
  '.room-card',
  '.operations-phases',
  '.system-service',
  '.publication-card',
  '.notification-card',
  '.workspace-auth-aside',
  '.ba-home .flow-strip',
  '.ba-home .quick-start',
  '.ba-home .news-banner',
  '.ba-home .journey-step',
  '.ba-home .tournament',
].join(',');
const AMBIENT =
  '.led-accent,.sector-art,.home-tech-scene,.bot-process,.arena,.ui-loading,[data-motion-state],[aria-busy="true"]';
const WATCH = `${REVEAL},${AMBIENT},[data-motion-stamp]`;

/** One observer pair and one on-demand pointer frame for the entire app. */
function MotionRuntime({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    const doc = document.documentElement;
    const root = document.querySelector<HTMLElement>('[data-arena-root]');
    if (!root) return;
    doc.dataset.arenaMotion = enabled ? 'full' : 'still';
    doc.dataset.arenaVisibility = document.hidden ? 'hidden' : 'visible';
    if (!enabled)
      return () => {
        delete doc.dataset.arenaMotion;
        delete doc.dataset.arenaVisibility;
      };
    const elements = new Set<Element>();
    const entrances = new Map<Element, ReturnType<typeof setTimeout>>();
    const stamps = new WeakMap<Element, string>();
    const freshness = new Map<Element, ReturnType<typeof setTimeout>>();
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)');
    let pointerFrame = 0;
    let scanFrame = 0;
    let tilt: HTMLElement | null = null;
    let pointerX = 0;
    let pointerY = 0;
    const clearTilt = () => {
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      tilt?.style.removeProperty('--fx-tilt-x');
      tilt?.style.removeProperty('--fx-tilt-y');
      tilt = null;
    };
    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const element = entry.target;
                element.setAttribute('data-motion-visible', String(entry.isIntersecting));
                if (
                  entry.isIntersecting &&
                  element.matches(REVEAL) &&
                  !element.hasAttribute('data-motion-entered')
                ) {
                  element.setAttribute('data-motion-entered', 'true');
                  element.setAttribute('data-motion-revealing', 'true');
                  entrances.set(
                    element,
                    setTimeout(() => {
                      element.removeAttribute('data-motion-revealing');
                      entrances.delete(element);
                    }, 560),
                  );
                }
              }
            },
            { threshold: 0.08 },
          )
        : null;
    const prune = () => {
      for (const element of elements) {
        if (element.isConnected) continue;
        observer?.unobserve(element);
        elements.delete(element);
        const timer = freshness.get(element);
        if (timer) clearTimeout(timer);
        freshness.delete(element);
        const entrance = entrances.get(element);
        if (entrance) clearTimeout(entrance);
        entrances.delete(element);
      }
    };
    const register = (element: Element) => {
      if (elements.has(element)) return;
      elements.add(element);
      const stamp = element.getAttribute('data-motion-stamp');
      if (stamp !== null) stamps.set(element, stamp);
      const index = element.parentElement
        ? (Array.prototype.indexOf.call(element.parentElement.children, element) as number)
        : 0;
      if (element instanceof HTMLElement || element instanceof SVGElement)
        element.style.setProperty('--fx-order', String(Math.min(Math.max(index, 0), 4)));
      if (observer) observer.observe(element);
      else {
        element.setAttribute('data-motion-visible', 'true');
        element.setAttribute('data-motion-entered', 'true');
      }
    };
    const scan = (node: Element) => {
      if (node.matches(WATCH)) register(node);
      for (const child of node.querySelectorAll(WATCH)) register(child);
    };
    const pending = new Set<Element>();
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          const node = record.target;
          if (!(node instanceof Element)) continue;
          if (record.attributeName === 'aria-busy') {
            if (node.matches(AMBIENT)) register(node);
            continue;
          }
          const stamp = node.getAttribute('data-motion-stamp') ?? '';
          const old = stamps.get(node);
          stamps.set(node, stamp);
          if (
            old === undefined ||
            old === stamp ||
            document.hidden ||
            node.getAttribute('data-motion-visible') !== 'true'
          )
            continue;
          const timer = freshness.get(node);
          if (timer) clearTimeout(timer);
          node.setAttribute('data-motion-update', 'fresh');
          freshness.set(
            node,
            setTimeout(() => {
              node.removeAttribute('data-motion-update');
              freshness.delete(node);
            }, 360),
          );
        } else {
          for (const node of record.addedNodes) if (node instanceof Element) pending.add(node);
          if (!scanFrame)
            scanFrame = requestAnimationFrame(() => {
              scanFrame = 0;
              for (const node of pending) if (node.isConnected) scan(node);
              pending.clear();
              prune();
            });
        }
      }
    });
    const visibility = () => {
      doc.dataset.arenaVisibility = document.hidden ? 'hidden' : 'visible';
      if (document.hidden) clearTilt();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !finePointer.matches || document.hidden) return;
      const target =
        event.target instanceof Element ? event.target.closest<HTMLElement>('[data-fx-tilt]') : null;
      if (target !== tilt) {
        clearTilt();
        tilt = target;
      }
      if (!target) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!pointerFrame)
        pointerFrame = requestAnimationFrame(() => {
          pointerFrame = 0;
          if (!tilt?.isConnected) return;
          const bounds = tilt.getBoundingClientRect();
          if (!bounds.width || !bounds.height) return;
          const x = Math.max(-1, Math.min(1, ((pointerX - bounds.left) / bounds.width) * 2 - 1));
          const y = Math.max(-1, Math.min(1, ((pointerY - bounds.top) / bounds.height) * 2 - 1));
          tilt.style.setProperty('--fx-tilt-x', `${-y * 3}deg`);
          tilt.style.setProperty('--fx-tilt-y', `${x * 4}deg`);
        });
    };
    const out = (event: PointerEvent) => {
      if (tilt && (!(event.relatedTarget instanceof Node) || !tilt.contains(event.relatedTarget)))
        clearTilt();
    };
    scan(root);
    mutations.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-motion-stamp', 'aria-busy'],
    });
    document.addEventListener('visibilitychange', visibility);
    root.addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerout', out, { passive: true });
    return () => {
      clearTilt();
      if (scanFrame) cancelAnimationFrame(scanFrame);
      observer?.disconnect();
      mutations.disconnect();
      for (const timer of freshness.values()) clearTimeout(timer);
      for (const [element, timer] of entrances) {
        clearTimeout(timer);
        element.removeAttribute('data-motion-revealing');
      }
      for (const element of elements) element.removeAttribute('data-motion-update');
      document.removeEventListener('visibilitychange', visibility);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerout', out);
      delete doc.dataset.arenaMotion;
      delete doc.dataset.arenaVisibility;
    };
  }, [enabled]);
  return null;
}

/** Tùy chọn chuyển động giao diện chung. Hiệu ứng LED luôn tự động chạy ngầm. */
export function MotionToggle() {
  const { enabled, systemReduced, toggle } = useArenaMotion();
  return (
    <button
      className="motion-toggle"
      type="button"
      title={
        systemReduced
          ? 'Thiết bị đang giảm chuyển động theo cài đặt hệ thống.'
          : undefined
      }
      aria-pressed={!enabled}
      onClick={toggle}
    >
      <svg
        className="ui-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden="true"
      >
        {enabled ? <path d="M8 5v14M16 5v14" /> : <path d="m8 5 11 7-11 7z" />}
      </svg>
      <span>
        {enabled ? 'Tạm dừng hiệu ứng' : 'Bật hiệu ứng chuyển động'}
      </span>
    </button>
  );
}
