import { Seo } from "@/components/Seo";
import { LoadingScreen } from "@/components/ui/spinner";
import { LandingCta } from "@/components/landing/LandingCta";
import { MarketingLayout } from "@/components/landing/MarketingLayout";
import { StackedScroll } from "@/components/landing/StackedScroll";
import { StripeDivider } from "@/components/landing/LinedShell";
import { usePublicMarketingPage } from "@/hooks/usePublicMarketingPage";

export default function LandingShowcase() {
  const { ready } = usePublicMarketingPage();

  if (!ready) {
    return <LoadingScreen variant="flip" />;
  }

  return (
    <>
      <Seo
        title="showcase"
        path="/showcase"
        description="See how Wings handles blocks, a local vault on this device, AI with Ask / Plan / Agent, and sharing by link or invite."
      />
      <MarketingLayout>
        <main>
          <StackedScroll />
          <StripeDivider />
          <LandingCta />
        </main>
      </MarketingLayout>
    </>
  );
}
