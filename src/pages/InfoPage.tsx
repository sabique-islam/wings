import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft } from "@/lib/icons";
import { ReactNode } from "react";
import { Seo, type FaqItem } from "@/components/Seo";

const ease = [0.22, 1, 0.36, 1] as const;

interface Props {
  eyebrow: string;
  title: string;
  updated?: string;
  path: string;
  description: string;
  faq?: FaqItem[];
  children: ReactNode;
}

export default function InfoPage({
  eyebrow,
  title,
  updated,
  path,
  description,
  faq,
  children,
}: Props) {
  const seoTitle = title.replace(/\.$/, "");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo title={seoTitle} path={path} description={description} faq={faq} />
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-background/60 border-b border-border/40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> back
          </Link>
          <span className="text-xs font-mono">wings</span>
        </div>
      </header>

      <article className="pt-32 pb-24 px-4 sm:px-6 max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          className="space-y-4 mb-12"
        >
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{eyebrow}</div>
          <h1 className="text-4xl md:text-6xl font-mono tracking-[-0.03em] leading-[1.05]">{title}</h1>
          {updated && <div className="text-xs font-mono text-muted-foreground">last updated · {updated}</div>}
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2, ease }}
          className="prose-info space-y-5 text-sm font-mono leading-relaxed text-foreground/85"
        >
          {children}
        </motion.div>
      </article>
    </div>
  );
}
