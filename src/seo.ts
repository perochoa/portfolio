import { SITE_DESCRIPTION, SITE_TITLE, SOCIAL } from "./consts";
import { withBase } from "./utils";

// schema.org structured data, passed to BaseHead's `jsonLd` prop.
const siteURL = new URL(withBase("/"), import.meta.env.SITE).href;

export const person = {
  "@type": "Person",
  "@id": `${siteURL}#person`,
  name: SITE_TITLE,
  url: siteURL,
  jobTitle: "ML Platform Engineer",
  worksFor: { "@type": "Organization", name: "Mobility Global" },
  affiliation: { "@type": "CollegeOrUniversity", name: "Western University" },
  sameAs: [SOCIAL.github, SOCIAL.linkedin, SOCIAL.instagram],
};

export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteURL}#website`,
      name: SITE_TITLE,
      description: SITE_DESCRIPTION,
      url: siteURL,
      inLanguage: "en",
      publisher: { "@id": person["@id"] },
    },
    person,
  ],
};

export function blogPostingJsonLd(post: {
  title: string;
  description: string;
  url: URL;
  image: URL;
  pubDate: Date;
  updatedDate?: Date;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url: post.url.href,
    mainEntityOfPage: post.url.href,
    image: post.image.href,
    datePublished: post.pubDate.toISOString(),
    dateModified: (post.updatedDate ?? post.pubDate).toISOString(),
    inLanguage: "en",
    author: person,
  };
}
