import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

/**
 * Smooth scroll, on the same clock as everything else: GSAP's ticker drives Lenis, and Lenis feeds ScrollTrigger.
 * Not started under reduced motion. Touch devices keep their native scrolling (Lenis leaves them alone by default).
 * Anchors clear the sticky nav through the page's own `scroll-margin-top`, which Lenis honors.
 * Anything that scrolls by itself (modals, tables, lists) carries `data-lenis-prevent`.
 */
export function startLenis() {
  if (lenis || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  lenis = new Lenis({ autoRaf: false, anchors: true, lerp: 0.12, wheelMultiplier: 1 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true });
  else window.scrollTo(0, 0);
}

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) lenis.scrollTo(el);
  else el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Freeze the page while a modal is open. */
export function lockScroll(on: boolean) {
  if (on) lenis?.stop();
  else lenis?.start();
}
