import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { C, S, clamp, fmt, smooth } from "./scene";

export { sceneSvg } from "./scene";

gsap.registerPlugin(ScrollTrigger);

// ---------- the driver: one variable (p) drives every part of the scene ----------
const P_START = 0.3; // first frame already has seats lit
const SEAT_END = 0.8; // all seats lit here, then the lid lifts

export function mountStage(stage: HTMLElement): () => void {
  const scene = stage.querySelector<HTMLElement>("[data-scene]")!;
  const seatsEl = stage.querySelector<HTMLElement>("[data-seats]");
  const stateEl = stage.querySelector<HTMLElement>("[data-state]");
  const cells = Array.from(stage.querySelectorAll<SVGPolygonElement>(".cell")).sort((a, b) => +a.dataset.o! - +b.dataset.o!);
  const lid = stage.querySelector<SVGGElement>("[data-lid]")!;
  const bed = Array.from(stage.querySelectorAll<SVGPolygonElement>(".bedcell"));
  const rays = Array.from(stage.querySelectorAll<SVGRectElement>(".ray"));
  const dust = Array.from(stage.querySelectorAll<SVGCircleElement>(".dust"));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let lit = 0;
  let lastState = "";
  const apply = (p: number, t: number, idle: boolean) => {
    const fill = clamp(p / SEAT_END);
    const lift = smooth(clamp((p - SEAT_END) / (1 - SEAT_END)));
    const want = Math.round(fill * cells.length);
    if (want !== lit) {
      const lo = Math.min(want, lit);
      const hi = Math.max(want, lit);
      for (let i = lo; i < hi; i++) cells[i].classList.toggle("on", i < want);
      lit = want;
    }
    // the next seat breathes while nobody is scrolling
    if (idle) {
      cells.forEach((c) => c.style.removeProperty("fill-opacity"));
      if (lit < cells.length) cells[lit].style.fillOpacity = String(0.12 + 0.22 * (0.5 + 0.5 * Math.sin(t * 3.2)));
    }
    const bedLit = clamp((lift - 0.15) / 0.6);
    bed.forEach((b) => {
      b.style.fillOpacity = String(0.9 * bedLit);
      b.classList.toggle("on", bedLit > 0.02);
    });
    const dx = lift * 4.2;
    const dz = lift * 9.5;
    lid.setAttribute("transform", `translate(${fmt(dx * C)} ${fmt(dx * S - dz)})`);

    rays.forEach((r) => {
      const flick = idle ? 0.72 + 0.28 * Math.sin(t * 1.4 + +r.dataset.p!) : 1;
      r.style.opacity = String(clamp(lift * 1.4 - 0.1) * flick);
    });
    dust.forEach((d) => {
      const prog = (t * 0.06 * +d.dataset.s! + +d.dataset.ph!) % 1;
      d.setAttribute("cy", String(fmt(+d.dataset.y! - prog * 11 * (idle ? 1 : 0.4))));
      d.setAttribute("cx", String(fmt(+d.dataset.x! + Math.sin(t * 0.7 + +d.dataset.ph! * 6) * 0.25)));
      d.style.opacity = String(clamp(lift * 1.2) * Math.sin(prog * Math.PI) * 0.9);
    });

    if (seatsEl) seatsEl.textContent = String(Math.round(fill * 100));
    const state = lift <= 0.001 ? "sealed" : lift < 0.985 ? "opening" : "risen";
    if (stateEl && state !== lastState) {
      stateEl.textContent = state;
      stateEl.dataset.state = state;
      lastState = state;
    }
  };

  if (reduced) {
    stage.classList.add("is-static");
    apply(0.6, 0, false);
    return () => {};
  }

  const st = { target: P_START, current: 0 };
  const trigger = ScrollTrigger.create({
    trigger: stage,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (s) => (st.target = P_START + (1 - P_START) * s.progress),
  });
  st.target = P_START + (1 - P_START) * trigger.progress;

  // the scene leans toward the pointer
  const qx = gsap.quickTo(scene, "x", { duration: 0.9, ease: "power3.out" });
  const qy = gsap.quickTo(scene, "y", { duration: 0.9, ease: "power3.out" });
  const onMove = (e: PointerEvent) => {
    qx((e.clientX / window.innerWidth - 0.5) * -24);
    qy((e.clientY / window.innerHeight - 0.5) * -14);
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  let visible = true;
  const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting), { threshold: 0 });
  io.observe(stage);

  const tick = (time: number, deltaMs: number) => {
    if (!visible) return;
    const k = 1 - Math.pow(0.0008, Math.min(deltaMs, 100) / 1000); // frame-rate independent easing
    st.current += (st.target - st.current) * k;
    apply(st.current, time, Math.abs(st.target - st.current) < 0.002);
  };
  gsap.ticker.add(tick);

  return () => {
    gsap.ticker.remove(tick);
    trigger.kill();
    io.disconnect();
    window.removeEventListener("pointermove", onMove);
    gsap.set(scene, { clearProps: "x,y" });
  };
}
