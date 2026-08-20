import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Seo } from "@/components/Seo";
import { PRICING_TIERS, INCLUDED_TODAY, type PricingTier } from "@/config/pricing";
import { PricingCard } from "@/components/pricing/PricingCard";
import { dodo } from "@/lib/payments/dodo";
import { toast } from "sonner";
import { MarketingLayout } from "@/components/landing/MarketingLayout";
import { LinedGrid, LinedHeading, StripeDivider, linedCellClass } from "@/components/landing/LinedShell";
import { LandingCta } from "@/components/landing/LandingCta";
import { motionEase } from "@/components/landing/constants";
import { getDashboardPath } from "@/lib/auth/redirect";

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboardPath, setDashboardPath] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (user) getDashboardPath(user.id).then(setDashboardPath);
    else setDashboardPath(null);
  }, [user]);

  const ctaHref = user ? (dashboardPath ?? "/app") : "/auth";
  const ctaLabel = user ? "open app" : "sign in";

  async function onSelect(tier: PricingTier) {
    if (tier.id === "free") {
      navigate(ctaHref);
      return;
    }
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!tier.productId) {
      toast.message("not available yet", { description: `${tier.name} is planned but payments aren't connected.` });
      return;
    }
    setBusyId(tier.id);
    try {
      await dodo.startCheckout({
        productId: tier.productId,
        customerEmail: user.email ?? undefined,
        returnUrl: `${window.location.origin}/pricing?checkout=success`,
        onEvent: (e) => {
          if (e.event_type === "checkout.success") toast.success("payment successful");
        },
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Seo
        title="pricing"
        path="/pricing"
        description="Wings is free today. Local vault, BYOK AI, and the editor ship on the free tier. Paid plans for hosted AI are planned but not live yet."
      />
      <MarketingLayout ctaHref={ctaHref} ctaLabel={ctaLabel}>
        <main>
          <LinedHeading
            as="h1"
            eyebrow="— pricing"
            title={<>free<br /><span className="text-accent-strong">for now.</span></>}
            subtitle="every feature listed on the site works on the free tier today — including a local vault on this device. paid plans below are placeholders. checkout isn't wired up yet."
          />
          <StripeDivider />

          <LinedGrid cols={3}>
            {PRICING_TIERS.map((tier, i) => (
              <PricingCard
                key={tier.id}
                tier={tier}
                index={i}
                onSelect={onSelect}
                busy={busyId === tier.id}
              />
            ))}
          </LinedGrid>
          <StripeDivider />

          <LinedHeading
            eyebrow="— included today"
            title={<>everything on<br className="hidden sm:block" /> free.</>}
            subtitle="local vault, BYOK AI, sharing, and the rest of the editor. no paid plan required."
          />
          <StripeDivider />

          <LinedGrid cols={3}>
            {INCLUDED_TODAY.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.03, ease: motionEase }}
                className={`${linedCellClass(3)} p-5 sm:p-6 transition-colors hover:bg-accent/20`}
              >
                <div className="text-[10px] font-mono text-ink-2 mb-2 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <p className="text-sm text-ink-1 font-sans leading-relaxed">{item}</p>
              </motion.div>
            ))}
          </LinedGrid>
          <StripeDivider />

          <p className="screen-line-bottom px-4 py-6 text-xs font-mono text-ink-2 leading-relaxed">
            cloud pages live in Supabase with row-level security. local vault bodies stay on this device. AI requests go from your browser to the provider you configure.
          </p>
          <StripeDivider />
          <LandingCta ctaHref={ctaHref} />
        </main>
      </MarketingLayout>
    </>
  );
}
