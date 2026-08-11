import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Seo } from "@/components/Seo";
import { PRICING_TIERS, INCLUDED_TODAY, type PricingTier } from "@/config/pricing";
import { PricingCard } from "@/components/pricing/PricingCard";
import { dodo } from "@/lib/payments/dodo";
import { toast } from "sonner";
import { NavBar } from "@/components/landing/NavBar";
import { Footer } from "@/components/landing/Footer";
import { Dither } from "@/components/ui/Dither";
import { Check } from "@/lib/icons";
import { getDashboardPath } from "@/lib/auth/redirect";

const ease = [0.22, 1, 0.36, 1] as const;

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
      <Seo title="pricing" path="/pricing" description="Wings is free today. Paid plans for hosted AI and higher limits are planned but not live yet." />
      <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
        <Dither variant="grain" fade="radial" density="sparse" className="opacity-100" />
        <NavBar ctaHref={ctaHref} ctaLabel={ctaLabel} />

        <section className="relative pt-28 sm:pt-36 pb-20 sm:pb-24 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto text-center space-y-4 sm:space-y-5 mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-1/40 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-ink-2">
              pricing
            </div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease }}
              className="font-display font-bold text-4xl sm:text-5xl md:text-7xl tracking-[-0.045em] leading-[0.95]"
            >
              free<br /><span className="text-accent-strong">for now.</span>
            </motion.h1>
            <p className="text-sm sm:text-base text-ink-1 font-sans max-w-lg mx-auto">
              every feature listed on the site works on the free tier today. paid plans below are placeholders — checkout isn't wired up yet.
            </p>
          </div>

          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
            {PRICING_TIERS.map((tier, i) => (
              <PricingCard
                key={tier.id}
                tier={tier}
                index={i}
                onSelect={onSelect}
                busy={busyId === tier.id}
              />
            ))}
          </div>

          <div className="max-w-2xl mx-auto mt-20 sm:mt-28">
            <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-ink-2 mb-6">— included today on free</div>
            <ul className="space-y-3 border-y border-border-subtle py-6">
              {INCLUDED_TODAY.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-ink-1 font-sans">
                  <Check className="w-4 h-4 text-accent-strong shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="max-w-2xl mx-auto text-center mt-12 sm:mt-16 text-xs font-mono text-ink-2">
            data is stored in Supabase with row-level security. AI requests go directly from your browser to the provider you configure.
          </div>
        </section>
        <Footer />
      </div>
    </>
  );
}
