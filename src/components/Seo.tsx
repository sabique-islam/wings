import { Helmet } from "react-helmet-async";
import { SITE } from "@/config/site";
import { buildDocumentTitle } from "@/lib/documentTitle";

export interface ArticleSeo {
  headline: string;
  datePublished: string;
  dateModified?: string;
  tags?: string[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

interface SeoProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  noIndex?: boolean;
  /** When true, emit Organization + SoftwareApplication JSON-LD (homepage). */
  jsonLd?: boolean;
  article?: ArticleSeo;
  faq?: FaqItem[];
}

function socialImageLd() {
  return {
    "@type": "ImageObject",
    url: SITE.ogImage,
    width: SITE.ogImageWidth,
    height: SITE.ogImageHeight,
    caption: SITE.ogImageAlt,
  };
}

function buildSiteJsonLd(url: string, description: string) {
  const image = socialImageLd();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#organization`,
        name: SITE.brand,
        url: SITE.url,
        email: SITE.email,
        logo: `${SITE.url}/wings-logo.png`,
        image,
        sameAs: [
          SITE.social.githubRepo,
          SITE.social.github,
          SITE.social.discord,
          SITE.social.twitter,
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        name: SITE.brand,
        url: SITE.url,
        description,
        publisher: { "@id": `${SITE.url}/#organization` },
        inLanguage: "en",
        image,
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE.url}/#app`,
        name: SITE.brand,
        url,
        description,
        applicationCategory: "ProductivityApplication",
        operatingSystem: "Web",
        browserRequirements: "Requires JavaScript",
        image,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        publisher: { "@id": `${SITE.url}/#organization` },
      },
    ],
  };
}

function buildArticleJsonLd(url: string, description: string, article: ArticleSeo) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.headline,
    description,
    image: socialImageLd(),
    datePublished: article.datePublished,
    dateModified: article.dateModified ?? article.datePublished,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: SITE.brand, url: SITE.url },
    publisher: {
      "@type": "Organization",
      name: SITE.brand,
      url: SITE.url,
      logo: `${SITE.url}/wings-logo.png`,
    },
    keywords: article.tags?.join(", "),
  };
}

function buildFaqJsonLd(faq: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function Seo({
  title,
  description = SITE.description,
  path = "/",
  image = SITE.ogImage,
  type = "website",
  noIndex = false,
  jsonLd = false,
  article,
  faq,
}: SeoProps) {
  const fullTitle = buildDocumentTitle(title);
  const url = `${SITE.url}${path}`;
  const ogImage = image.startsWith("http") ? image : `${SITE.url}${image}`;
  const ogTitle = title ? fullTitle : SITE.ogTitle;
  const ogDescription = title ? description : SITE.ogDescription;
  const isDefaultOg = ogImage === SITE.ogImage;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <link rel="icon" href="/favicon.ico" type="image/x-icon" />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={ogDescription} />
      <meta property="og:url" content={url} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:url" content={ogImage} />
      <meta property="og:image:secure_url" content={ogImage} />
      <meta property="og:image:alt" content={SITE.ogImageAlt} />
      {isDefaultOg && (
        <>
          <meta property="og:image:type" content={SITE.ogImageType} />
          <meta property="og:image:width" content={String(SITE.ogImageWidth)} />
          <meta property="og:image:height" content={String(SITE.ogImageHeight)} />
        </>
      )}
      <link rel="image_src" href={ogImage} />
      {article && (
        <>
          <meta property="article:published_time" content={article.datePublished} />
          <meta property="article:modified_time" content={article.dateModified ?? article.datePublished} />
        </>
      )}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={SITE.twitterHandle} />
      <meta name="twitter:creator" content={SITE.twitterHandle} />
      <meta name="twitter:title" content={ogTitle} />
      <meta name="twitter:description" content={ogDescription} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={SITE.ogImageAlt} />

      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(buildSiteJsonLd(url, description))}</script>
      )}
      {article && (
        <script type="application/ld+json">{JSON.stringify(buildArticleJsonLd(url, description, article))}</script>
      )}
      {faq && faq.length > 0 && (
        <script type="application/ld+json">{JSON.stringify(buildFaqJsonLd(faq))}</script>
      )}
    </Helmet>
  );
}
