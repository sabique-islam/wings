import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft } from "@/lib/icons";
import { motion } from "framer-motion";
import { Seo } from "@/components/Seo";
import { SITE } from "@/config/site";
import { blogMarkdownToHtml, getPostBySlug } from "@/content/blog";

const ease = [0.22, 1, 0.36, 1] as const;

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPostBySlug(slug) : undefined;
  if (!post) return <Navigate to="/blog" replace />;

  const path = `/blog/${post.slug}`;
  const html = blogMarkdownToHtml(post.body);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo
        title={post.title}
        description={post.description}
        path={path}
        type="article"
        article={{
          headline: post.title,
          datePublished: post.date,
          dateModified: post.updated,
          tags: post.tags,
        }}
      />
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-background/60 border-b border-border/40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            to="/blog"
            className="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> blog
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
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
            blog · {post.date}
          </div>
          <h1 className="text-4xl md:text-5xl font-mono tracking-[-0.03em] leading-[1.05]">{post.title}</h1>
          <p className="text-sm font-mono text-muted-foreground">{post.description}</p>
          <div className="text-xs font-mono text-muted-foreground">
            <a href={`/blog/${post.slug}.md`} className="underline underline-offset-2 hover:text-foreground">
              markdown mirror
            </a>
            {" · "}
            <a href={`mailto:${SITE.email}`} className="underline underline-offset-2 hover:text-foreground">
              {SITE.email}
            </a>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease }}
          className="prose-info space-y-5 text-sm font-mono leading-relaxed text-foreground/85"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <p className="pt-12 mt-12 border-t border-border/40 text-xs font-mono text-muted-foreground">
          Written by Opus 5 for site content. To be rewritten later.
        </p>
      </article>
    </div>
  );
}
