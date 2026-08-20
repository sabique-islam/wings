import { useEffect } from "react";
import { usePublicMarketingPage } from "@/hooks/usePublicMarketingPage";
import { registerLandingWebMcp } from "@/lib/webmcp";
import { Hero } from "@/components/landing/Hero";
import { InfiniteMarquee } from "@/components/landing/InfiniteMarquee";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { StackedScroll } from "@/components/landing/StackedScroll";
import { LandingCta } from "@/components/landing/LandingCta";
import { MarketingLayout } from "@/components/landing/MarketingLayout";
import { StripeDivider } from "@/components/landing/LinedShell";
import { Seo } from "@/components/Seo";
import { LoadingScreen } from "@/components/ui/spinner";

const MARQUEE_FEATURES = [
  "ask / plan / agent",
  "block editor",
  "local vault",
  "on this device",
  "latex",
  "excalidraw",
  "databases",
  "wikilinks",
  "collab",
];

const MARQUEE_SHORTCUTS = [
  "⌘J ai",
  "/ slash",
  "$$ math $$",
  "[[]] wiki",
  "✎ drawings",
  "↗ /s/",
  "⌘K palette",
];

export default function Landing() {
  const { ready } = usePublicMarketingPage();

  useEffect(() => {
    if (!ready) return;
    return registerLandingWebMcp();
  }, [ready]);

  if (!ready) {
    return <LoadingScreen variant="flip" />;
  }

  const ctaHref = "/auth";

  return (
    <>
      <Seo path="/" jsonLd />
      <MarketingLayout ctaHref={ctaHref}>
        <Hero ctaHref={ctaHref} />
        <StripeDivider />
        <InfiniteMarquee items={MARQUEE_FEATURES} />
        <StripeDivider />
        <FeatureGrid />
        <StripeDivider />
        <InfiniteMarquee reverse items={MARQUEE_SHORTCUTS} />
        <StripeDivider />
        <StackedScroll />
        <StripeDivider />
        <LandingCta ctaHref={ctaHref} />
      </MarketingLayout>
    </>
  );
}
