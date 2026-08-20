import InfoPage from "./InfoPage";
import { LEGAL_DOCS } from "@/content/legal";

type Slug = keyof typeof LEGAL_DOCS;

export default function Legal({ slug }: { slug: Slug }) {
  const doc = LEGAL_DOCS[slug];
  if (!doc) return null;
  return (
    <InfoPage
      eyebrow={doc.eyebrow}
      title={doc.title}
      updated="aug 2026"
      path={`/legal/${slug}`}
      description={doc.description}
    >
      {doc.sections.map((s, i) => (
        <section key={i} className="space-y-2">
          {s.h && <h2 className="text-base font-mono text-foreground tracking-tight uppercase">— {s.h}</h2>}
          <p className="text-muted-foreground">{s.p}</p>
        </section>
      ))}
    </InfoPage>
  );
}
