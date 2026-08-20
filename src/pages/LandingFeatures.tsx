import { Seo } from "@/components/Seo";
import { LoadingScreen } from "@/components/ui/spinner";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { InfiniteMarquee } from "@/components/landing/InfiniteMarquee";
import { LandingCta } from "@/components/landing/LandingCta";
import { MarketingLayout } from "@/components/landing/MarketingLayout";
import { StripeDivider } from "@/components/landing/LinedShell";
import { usePublicMarketingPage } from "@/hooks/usePublicMarketingPage";

export default function LandingFeatures() {
  const { ready } = usePublicMarketingPage();

  if (!ready) {
    return <LoadingScreen variant="flip" />;
  }

  return (
    <>
      <Seo
        title="features"
        path="/features"
        description="Wings features: block editor, local vault folder, LaTeX math, Excalidraw, Ask / Plan / Agent AI, sharing, and collab."
      />
      <MarketingLayout>
        <main>
          <InfiniteMarquee items={["ask / plan / agent", "block editor", "local vault", "on this device", "latex", "excalidraw", "databases", "wikilinks", "collab"]} />
          <StripeDivider />
          <FeatureGrid />
          <StripeDivider />
          <InfiniteMarquee reverse items={["⌘J ai", "/ slash", "$$ math $$", "[[]] wiki", "✎ drawings", "↗ /s/", "⌘K palette"]} />
          <StripeDivider />
          <LandingCta />
        </main>
      </MarketingLayout>
    </>
  );
}
