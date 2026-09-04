import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BAR_COUNT = 24;
const MIN_HEIGHT = 0.08;
const MAX_HEIGHT = 0.82;
const SPEED = 1.6;

/** Inverted arch + two offset sines. Shared by the rAF loop and the first paint. */
export function auroraBarScale(
  index: number,
  count: number,
  time: number,
  min: number,
  max: number,
  inverse: boolean,
) {
  let arch = Math.sin((count > 1 ? index / (count - 1) : 0.5) * Math.PI);
  if (inverse) arch = 1 - arch;
  const ripple =
    0.5 +
    0.25 * Math.sin(1.1 * time + (index / count) * Math.PI * 2) +
    0.25 * Math.sin(0.7 * time + (index / count) * Math.PI * 5.3);
  return min + (0.75 * arch + 0.25 * ripple) * (max - min);
}

interface Props {
  className?: string;
  inverse?: boolean;
}

export function AuroraBars({ className, inverse = true }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let time = 0;
    let last = performance.now();
    let frame = 0;
    let inView = true;
    let pageVisible = document.visibilityState === "visible";

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
      },
      { threshold: 0.08 },
    );
    io.observe(root);

    const onVisibility = () => {
      pageVisible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);

    const paint = (now: number) => {
      const dt = now - last;
      last = now;
      const animate = inView && pageVisible && !motionQuery.matches;
      if (animate) {
        time += (dt / 1000) * SPEED;
        const bars = barsRef.current;
        for (let i = 0; i < BAR_COUNT; i += 1) {
          const el = bars[i];
          if (!el) continue;
          el.style.transform = `scaleY(${auroraBarScale(i, BAR_COUNT, time, MIN_HEIGHT, MAX_HEIGHT, inverse)})`;
        }
      }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [inverse]);

  return (
    <div ref={rootRef} aria-hidden className={cn("aurora-bars", className)}>
      <div className="absolute inset-0 flex items-end">
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <div key={`bar-${i}`} className="flex h-full flex-1 items-end">
            <div
              ref={(el) => {
                barsRef.current[i] = el;
              }}
              className="aurora-bar"
              style={{
                transform: `scaleY(${auroraBarScale(i, BAR_COUNT, 0, MIN_HEIGHT, MAX_HEIGHT, inverse)})`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
