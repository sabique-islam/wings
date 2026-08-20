import { lazy, Suspense, useEffect, useRef, useState } from "react";

type GraphicKind = "gyro" | "folder" | "tornado" | "smiley";

const GyroRings = lazy(() => import("@/components/originkit/ui/gyro-rings"));
const Tornado = lazy(() => import("@/components/originkit/ui/tornado"));

const SVG: Record<"folder" | "smiley", string> = {
  folder: "/svg/folder.svg",
  smiley: "/svg/infinte-smiley.svg",
};

function useGraphicPlayback() {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let intersecting = false;

    const sync = () => {
      const on =
        intersecting &&
        document.visibilityState === "visible" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (intersecting) setMounted(true);
      setPaused(!on);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting;
        sync();
      },
      { rootMargin: "180px 0px", threshold: 0.01 },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return { ref, mounted, paused };
}

function SvgGraphic({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      decoding="async"
      loading="lazy"
      fetchPriority="low"
      draggable={false}
      className="pointer-events-none h-full w-full object-cover"
    />
  );
}

export function FeatureGraphic({ kind }: { kind: GraphicKind }) {
  const { ref, mounted, paused } = useGraphicPlayback();

  if (kind === "folder" || kind === "smiley") {
    return (
      <div ref={ref} className="absolute inset-0" aria-hidden>
        <SvgGraphic src={SVG[kind]} />
      </div>
    );
  }

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0" aria-hidden>
      {mounted && (
        <Suspense fallback={null}>
          {kind === "gyro" ? (
            <GyroRings
              finish="solid"
              color="#ffffff"
              tint="#ffffff"
              rings={4}
              spin={2}
              hoverBoost={0}
              sizePercent={88}
              paused={paused}
              style={{ minWidth: 0, minHeight: 0 }}
            />
          ) : (
            <Tornado
              background="#000000"
              zoom={82}
              speed={8}
              paused={paused}
              lineOptions={{ count: 48, color: "#ffffff", glow: 6 }}
              dotOptions={{ count: 600, size: 16, color: "#ffffff", glow: 6, flicker: 6 }}
              cometOptions={{
                count: 3,
                speed: 5,
                color: "#ffffff",
                glow: 4,
                tail: 10,
                delay: 6,
                collide: 0,
              }}
            />
          )}
        </Suspense>
      )}
    </div>
  );
}
