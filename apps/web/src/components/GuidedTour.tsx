import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import { tourFor, type Tour, type TourStep } from '../lib/tours';

const SEEN_PREFIX = 'porcelanas.tour.';
const AUTO_OFF_KEY = 'porcelanas.tour.auto-off';
const PAD = 8;
const GAP = 14;

function readFlag(key: string) {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Sin almacenamiento (modo privado): el recorrido volverá a ofrecerse, sin más efectos.
  }
}

function isVisible(el: Element) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** Primer destino visible de la lista de selectores (ver `TourStep.target`). */
export function findTarget(selectors?: string[]): HTMLElement | null {
  for (const sel of selectors ?? []) {
    let el: Element | null | undefined;
    if (sel.startsWith('h:')) {
      const text = sel.slice(2);
      const heading = [...document.querySelectorAll('#contenido h1, #contenido h2, #contenido legend')].find((h) => h.textContent?.trim() === text);
      el = heading ? (heading.closest('section, .card, fieldset, aside') ?? heading) : null;
    } else {
      el = [...document.querySelectorAll(sel)].find(isVisible);
    }
    if (el && isVisible(el)) return el as HTMLElement;
  }
  return null;
}

/** Pasos con contenido visible; si ninguno lo tiene, un único aviso centrado. */
export function resolveSteps(tour: Tour): TourStep[] {
  const steps = tour.steps.filter((s) => !s.target || findTarget(s.target));
  if (steps.some((s) => s.target) || !tour.steps.some((s) => s.target)) return steps;
  return [{ title: tour.window, body: tour.empty ?? 'Esta ventana aún no tiene información para recorrer. Vuelve a intentarlo cuando haya datos.' }];
}

/** Espera a que la ventana termine de cargar (sin indicadores de carga) antes de medir. */
function whenReady(cb: () => void, isCancelled: () => boolean) {
  const started = Date.now();
  const check = () => {
    if (isCancelled()) return;
    const loading = document.querySelector('#contenido .animate-spin');
    if (!loading || Date.now() - started > 4000) cb();
    else window.setTimeout(check, 150);
  };
  window.setTimeout(check, 250);
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const sameBox = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

export function GuidedTour() {
  const { pathname } = useLocation();
  const tour = tourFor(pathname);
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(false);
  const [spot, setSpot] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(0);
  const [, setViewport] = useState(0);
  const [seen, setSeen] = useState(true);
  const targetRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const openId = useRef<string | null>(null);

  const open = steps !== null && !!tour;
  const step = steps?.[index];
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const start = useCallback(
    (t: Tour, isAuto: boolean) => {
      openId.current = t.id;
      returnFocus.current = document.activeElement;
      setAuto(isAuto);
      setIndex(0);
      setSteps(resolveSteps(t));
    },
    [],
  );

  const close = useCallback(() => {
    if (tour) writeFlag(SEEN_PREFIX + tour.id);
    openId.current = null;
    setSeen(true);
    setSteps(null);
    targetRef.current = null;
    setSpot(null);
    const el = returnFocus.current;
    if (el instanceof HTMLElement) el.focus({ preventScroll: true });
  }, [tour]);

  // Al cambiar de ventana: cierra el recorrido abierto y, la primera vez, lo inicia solo.
  useEffect(() => {
    // Solo se cierra si el recorrido abierto es de otra ventana (no uno recién abierto en esta).
    if (openId.current && openId.current !== tour?.id) {
      openId.current = null;
      setSteps(null);
      targetRef.current = null;
    }
    if (!tour) return;
    const wasSeen = readFlag(SEEN_PREFIX + tour.id);
    setSeen(wasSeen);
    // Las pruebas automatizadas (navigator.webdriver) no reciben recorridos automáticos.
    if (wasSeen || readFlag(AUTO_OFF_KEY) || navigator.webdriver) return;
    let cancelled = false;
    whenReady(() => !openId.current && !readFlag(SEEN_PREFIX + tour.id) && start(tour, true), () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [tour, start]);

  // Ubica y desplaza hasta el destino de cada paso.
  useEffect(() => {
    if (!open || !step) return;
    const el = findTarget(step.target);
    targetRef.current = el;
    if (el) {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const offset = r.height > vh - 300 ? 100 : Math.max(100, (vh - r.height - 240) / 2);
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top - offset), behavior: reducedMotion ? 'auto' : 'smooth' });
    }
    nextRef.current?.focus({ preventScroll: true });
  }, [open, step, reducedMotion]);

  // Sigue al destino mientras la página se desplaza o cambia de tamaño.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const tick = () => {
      const el = targetRef.current;
      let box: Box | null = null;
      if (el?.isConnected) {
        const r = el.getBoundingClientRect();
        const top = Math.max(r.top - PAD, 4);
        const bottom = Math.min(r.bottom + PAD, window.innerHeight - 4);
        box = { top: Math.round(top), left: Math.round(r.left - PAD), width: Math.round(r.width + PAD * 2), height: Math.round(Math.max(bottom - top, 0)) };
      }
      setSpot((prev) => (sameBox(prev, box) ? prev : box));
      raf = requestAnimationFrame(tick);
    };
    tick();
    const onResize = () => setViewport(window.innerWidth * 10000 + window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open && cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [open, index, steps]);

  const go = useCallback(
    (delta: number) => {
      if (!steps) return;
      const n = index + delta;
      if (n >= steps.length) close();
      else if (n >= 0) setIndex(n);
    },
    [steps, index, close],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, go]);

  const launcher = tour && !open && (
    <button
      type="button"
      onClick={() => start(tour, false)}
      className="fixed bottom-6 left-6 z-40 flex h-12 items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-xs uppercase tracking-[0.16em] text-ink shadow-gallery transition hover:border-ink"
      aria-label="Recorrido guiado de esta ventana"
      title={`Recorrido guiado: ${tour.window}`}
      data-testid="tour-launcher"
    >
      <Compass className="h-5 w-5" aria-hidden />
      <span className="hidden sm:inline">Recorrido</span>
      {!seen && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-ink" aria-hidden />}
    </button>
  );

  if (!open || !step || !steps) return launcher || null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(380, vw - 32);
  let cardTop: number;
  let cardLeft: number;
  if (spot) {
    const below = spot.top + spot.height + GAP;
    const above = spot.top - GAP - cardH;
    const right = spot.left + spot.width + GAP;
    const left = spot.left - GAP - cardW;
    cardLeft = Math.min(Math.max(spot.left, 16), vw - cardW - 16);
    if (below + cardH <= vh - 16) cardTop = below;
    else if (above >= 16) cardTop = above;
    else {
      // Zona alta: la tarjeta va al costado si cabe; si no, abajo sobre la zona.
      cardTop = Math.min(Math.max(spot.top, 96), vh - cardH - 16);
      if (right + cardW <= vw - 16) cardLeft = right;
      else if (left >= 16) cardLeft = left;
      else cardTop = vh - cardH - 16;
    }
  } else {
    cardTop = Math.max(16, (vh - cardH) / 2);
    cardLeft = (vw - cardW) / 2;
  }
  const hole = spot ?? { top: vh / 2, left: vw / 2, width: 0, height: 0 };
  const motion = 'transition-all duration-500 ease-[cubic-bezier(.65,0,.35,1)] motion-reduce:transition-none';
  const last = index === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[60]" data-testid="tour">
      {/* Capa que bloquea la página mientras dura el recorrido. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} aria-hidden />
      <div
        className={`pointer-events-none absolute border border-white/80 ${motion}`}
        style={{ ...hole, boxShadow: '0 0 0 9999px rgba(24, 24, 23, 0.58)' }}
        aria-hidden
      >
        {spot && <div key={index} className="absolute inset-0 animate-tour-ring motion-reduce:animate-none" />}
      </div>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className={`absolute border border-stone-200 bg-white p-5 shadow-gallery ${motion}`}
        style={{ top: cardTop, left: cardLeft, width: cardW, opacity: cardH ? 1 : 0 }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">
            {tour.window} · {index + 1} de {steps.length}
          </p>
          <button type="button" className="-mr-2 -mt-2 p-2 text-ink-muted hover:text-ink" onClick={close} aria-label="Cerrar recorrido">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div key={index} className="animate-tour-in motion-reduce:animate-none">
          <h2 id="tour-title" className="mt-2 text-2xl">
            {step.title}
          </h2>
          <p id="tour-body" className="mt-2 text-sm leading-relaxed text-ink-soft">
            {step.body}
          </p>
        </div>
        <div className="mt-4 h-px bg-stone-200" aria-hidden>
          <div className={`h-px bg-ink ${motion}`} style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          {index > 0 ? (
            <button type="button" className="btn-ghost btn-sm px-2" onClick={() => go(-1)}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Anterior
            </button>
          ) : auto ? (
            <button
              type="button"
              className="text-[11px] text-ink-muted underline-offset-4 hover:text-ink hover:underline"
              onClick={() => {
                writeFlag(AUTO_OFF_KEY);
                close();
              }}
            >
              No mostrar automáticamente
            </button>
          ) : (
            <span />
          )}
          <button ref={nextRef} type="button" className="btn-primary btn-sm" onClick={() => go(1)}>
            {last ? 'Terminar' : 'Siguiente'} {!last && <ArrowRight className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
