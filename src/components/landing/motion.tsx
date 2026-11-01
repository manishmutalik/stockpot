/**
 * motion.tsx
 *
 * The landing page's motion, in one place: things that rise into view, a parallax that moves layers at different speeds as
 * the page scrolls, soft colour shapes drifting behind the sections, food icons floating around the hero, a tilt toward
 * the mouse, and a bar under the header that fills as the visitor reads down the page.
 *
 * All of it is decoration. Nothing moves for a visitor who asks for reduced motion (wantsLessMotion here, and the
 * `prefers-reduced-motion` block in src/index.css), and the page reads the same without it.
 *
 * Scrolling is watched once for the whole page (onScrollFrames): on each frame every watcher first measures, then every
 * watcher writes, so measuring never waits on a style just written. What moves is always an inner layer, and what is
 * measured is its unmoved frame, so a layer's own movement never feeds back into where it is drawn.
 */
import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';

/** True when the visitor asked for less motion. A browser that cannot say gets the motion. */
export const wantsLessMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A scroll watcher: measures, and returns what to write (or nothing). */
type Watcher = () => void | (() => void);

const watchers = new Set<Watcher>();
let pending = 0;
const runWatchers = () => {
  pending = 0;
  const writes: (() => void)[] = [];
  watchers.forEach(measure => { const write = measure(); if (write) writes.push(write); });
  writes.forEach(write => write());
};
const onScrollOrResize = () => { if (!pending) pending = requestAnimationFrame(runWatchers); };

/**
 * Runs `watch` now and on the next frame after each scroll or resize, until the returned function is called. `watch` may
 * return a function that writes; those run after every watcher has measured.
 */
export function onScrollFrames(watch: Watcher): () => void {
  if (watchers.size === 0) {
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
  }
  watchers.add(watch);
  const write = watch();
  if (write) write();
  return () => {
    watchers.delete(watch);
    if (watchers.size === 0) {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      if (pending) cancelAnimationFrame(pending);
      pending = 0;
    }
  };
}

/**
 * How far a frame's middle is from the screen's middle, in screen heights: 0 when centred, about +1 just below the screen,
 * about -1 just above it. Null while the frame is well off screen, when nothing need move.
 */
function offsetFromCentre(frame: HTMLElement): number | null {
  const rect = frame.getBoundingClientRect();
  const h = window.innerHeight || 1;
  if (rect.bottom < -h * 0.5 || rect.top > h * 1.5) return null;
  return (rect.top + rect.height / 2 - h / 2) / h;
}

/**
 * Moves `layer` up or down by `strength` pixels per screen height its `frame` is from the middle of the screen: a positive
 * strength lags behind the scroll (feels further away), a negative one runs ahead (feels nearer). `extra` is added after
 * the move (a scale, say).
 */
export function useLayerParallax<F extends HTMLElement, L extends HTMLElement>(strength: number, extra = '') {
  const frame = useRef<F>(null);
  const layer = useRef<L>(null);
  useEffect(() => {
    const box = frame.current;
    const el = layer.current;
    if (!box || !el || wantsLessMotion()) return;
    return onScrollFrames(() => {
      const at = offsetFromCentre(box);
      if (at === null) return;
      return () => { el.style.transform = `translate3d(0, ${(at * strength).toFixed(1)}px, 0) ${extra}`.trim(); };
    });
  }, [strength, extra]);
  return [frame, layer] as const;
}

/** Drifts an element a fraction of the way the page has scrolled (for what sits at the very top, like the hero's glows). */
export function useDrift<T extends HTMLElement>(speed: number) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || wantsLessMotion()) return;
    return onScrollFrames(() => {
      const y = window.scrollY;
      return () => { el.style.transform = `translate3d(0, ${(y * speed).toFixed(1)}px, 0)`; };
    });
  }, [speed]);
  return ref;
}

/** Wraps `children` in a layer that moves at its own speed as the page scrolls (see useLayerParallax). */
export const Parallax: React.FC<{ children: React.ReactNode; strength: number; className?: string; layerClassName?: string }> = ({
  children, strength, className = '', layerClassName = '',
}) => {
  const [frame, layer] = useLayerParallax<HTMLDivElement, HTMLDivElement>(strength);
  return (
    <div ref={frame} className={className}>
      <div ref={layer} className={`will-change-transform ${layerClassName}`}>{children}</div>
    </div>
  );
};

/** Rises (or slides in from a side) and fades in the first time it comes into view. */
export const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number; from?: 'below' | 'left' | 'right' }> = ({
  children, className, delay = 0, from = 'below',
}) => (
  <motion.div
    initial={{ opacity: 0, x: from === 'left' ? -36 : from === 'right' ? 36 : 0, y: from === 'below' ? 16 : 0 }}
    whileInView={{ opacity: 1, x: 0, y: 0 }}
    viewport={{ once: true, margin: '-40px' }}
    transition={{ duration: from === 'below' ? 0.45 : 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    className={className}
  >
    {children}
  </motion.div>
);

/** Tilts what is inside it a few degrees toward the mouse. Only for a mouse (not touch) and not for reduced motion. */
export const Tilt: React.FC<{ children: React.ReactNode; className?: string; max?: number }> = ({ children, className = '', max = 5 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const live = useRef(false);
  useEffect(() => {
    live.current = !wantsLessMotion() && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;
    return () => cancelAnimationFrame(frame.current);
  }, []);
  const move = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!live.current || !el) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const rx = (((clientY - r.top - r.height / 2) / (r.height / 2)) * -max).toFixed(2);
      const ry = (((clientX - r.left - r.width / 2) / (r.width / 2)) * max).toFixed(2);
      el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.015, 1.015, 1.015)`;
    });
  };
  const leave = () => { cancelAnimationFrame(frame.current); if (ref.current) ref.current.style.transform = ''; };
  return <div ref={ref} onMouseMove={move} onMouseLeave={leave} className={`landing-tilt ${className}`}>{children}</div>;
};

/** A thin bar under the header that fills as the visitor reads down the page. */
export const ScrollProgress: React.FC = () => {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    return onScrollFrames(() => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      const done = room > 0 ? Math.min(1, Math.max(0, window.scrollY / room)) : 0;
      return () => { el.style.transform = `scaleX(${done.toFixed(4)})`; };
    });
  }, []);
  return (
    <div className="absolute left-0 right-0 bottom-0 h-0.5 pointer-events-none" aria-hidden="true">
      <div ref={bar} className="h-full origin-left bg-gradient-to-r from-primary via-primary-light to-margin" style={{ transform: 'scaleX(0)' }} />
    </div>
  );
};

/** The colours a backdrop's shapes come in, to suit the band they sit on. */
export type BackdropTone = 'warm' | 'cool' | 'white' | 'dark';

const BACKDROP_SHAPES: Record<BackdropTone, readonly string[]> = {
  warm: ['bg-[#f3c98b]/35', 'bg-primary-light/25', 'bg-coral/15'],
  cool: ['bg-primary-light/30', 'bg-[#9fd3c7]/30', 'bg-[#f3c98b]/25'],
  white: ['bg-primary-light/20', 'bg-[#f3c98b]/25', 'bg-[#cfe3f5]/30'],
  dark: ['bg-primary/35', 'bg-[#f3c98b]/15', 'bg-margin/20'],
};

/** Where each of a backdrop's three shapes sits, how big it is, and how fast it moves with the scroll. */
const SHAPE_LAYOUT = [
  { place: '-top-24 -left-24 w-72 h-72 sm:w-96 sm:h-96', strength: 70, drift: 'landing-blob-a' },
  { place: 'top-1/3 -right-28 w-64 h-64 sm:w-[28rem] sm:h-[28rem]', strength: -50, drift: 'landing-blob-b' },
  { place: '-bottom-28 left-1/4 w-60 h-60 sm:w-80 sm:h-80', strength: 110, drift: 'landing-blob-c' },
] as const;

/**
 * Soft, blurred colour shapes behind a section: each drifts slowly on its own and moves at its own speed as the page
 * scrolls, so the background feels deeper than the content. Put it first inside a section that is `relative isolate
 * overflow-hidden`; it sits behind everything else in the section. An optional dotted grid lies over the shapes.
 */
export const Backdrop: React.FC<{ tone: BackdropTone; dots?: boolean }> = ({ tone, dots = false }) => {
  const frame = useRef<HTMLDivElement>(null);
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const box = frame.current;
    if (!box || wantsLessMotion()) return;
    return onScrollFrames(() => {
      const at = offsetFromCentre(box);
      if (at === null) return;
      return () => layers.current.forEach((el, i) => {
        if (!el) return;
        const strength = i < SHAPE_LAYOUT.length ? SHAPE_LAYOUT[i].strength : 30;
        el.style.transform = `translate3d(0, ${(at * strength).toFixed(1)}px, 0)`;
      });
    });
  }, []);
  return (
    <div ref={frame} className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true" data-backdrop={tone}>
      {SHAPE_LAYOUT.map(({ place, drift }, i) => (
        <div key={i} ref={el => { layers.current[i] = el; }} className={`absolute ${place} will-change-transform`}>
          <div className={`${drift} w-full h-full rounded-full blur-3xl ${BACKDROP_SHAPES[tone][i]}`} />
        </div>
      ))}
      {dots && (
        <div ref={el => { layers.current[SHAPE_LAYOUT.length] = el; }} className="absolute inset-x-0 -top-16 -bottom-16 will-change-transform">
          <div className={`landing-dots w-full h-full ${tone === 'dark' ? 'landing-dots-light' : ''}`} />
        </div>
      )}
    </div>
  );
};

/** One food icon floating around the hero: where it sits, how big, how fast it moves with the scroll, and its bob. */
export interface Floater { icon: LucideIcon; place: string; size: number; strength: number; bob: 'a' | 'b' | 'c'; tint: string }

/** A food icon in a soft round chip, bobbing gently and moving at its own speed as the page scrolls. */
export const FloatingIcon: React.FC<Floater> = ({ icon: Icon, place, size, strength, bob, tint }) => {
  const [frame, layer] = useLayerParallax<HTMLDivElement, HTMLDivElement>(strength);
  return (
    <div ref={frame} className={`absolute ${place} pointer-events-none`} aria-hidden="true">
      <div ref={layer} className="will-change-transform">
        <div className={`landing-bob-${bob} flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm border border-white shadow-lg shadow-[#b8a58a]/15 ${tint}`}
          style={{ width: size * 2.2, height: size * 2.2 }}>
          <Icon size={size} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
};
