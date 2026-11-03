import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Blob } from "./blob.tsx";
import { docs, sdk } from "./content.ts";
import { DocPage } from "./docs.tsx";
import { Home } from "./home.tsx";
import { Shell } from "./layout.tsx";
import { href, origin, url } from "./site.ts";
// Rendered from the home page's blobs and heading in the site's font, at the 1200×630 that link previews use.
import card from "./card.png";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function NotFound() {
  return (
    <Shell>
      <main className="mx-auto grid max-w-6xl justify-items-start gap-5 px-4 py-24 sm:px-6">
        <Blob shape="cloud" color="gray" size={72} busy />
        <h1 className="text-3xl font-semibold tracking-tight">This page isn't here</h1>
        <p className="text-muted-foreground">
          Try the <a className="text-foreground underline underline-offset-4" href={href("/")}>home page</a> or the{" "}
          <a className="text-foreground underline underline-offset-4" href={href("/docs/")}>
            docs
          </a>
          .
        </p>
      </main>
    </Shell>
  );
}

// The tags a page needs to show as a preview card when its link is shared, and to be listed once by search engines.
function shareTags(address: string, title: string, description: string) {
  return [
    `<link rel="canonical" href="${address}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="fxbot" />`,
    `<meta property="og:url" content="${address}" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(description)}" />`,
    `<meta property="og:image" content="${origin}${card}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="fxbot: Your bot, built and configured how you want it. A lean core. Local first. Grows with the plugins you pick." />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ];
}

// Every page of the site: the file it is written to in out/, its address (none for the 404, which search engines
// skip), what goes in its <head>, and its <body>.
export function pages() {
  const page = (path: string, title: string, description: string, body: ReactElement) => ({
    file: `${path}index.html`,
    url: url(path),
    head: [`<title>${escape(title)}</title>`, `<meta name="description" content="${escape(description)}" />`, ...shareTags(url(path), title, description)].join("\n    "),
    body: renderToStaticMarkup(body),
  });
  const about = "fxbot is your bot, built and configured how you want it: a lean, local-first core that works with local models and grows with the plugins you pick.";
  return [
    page("", "fxbot: your bot, built how you want it", about, <Home />),
    ...docs.map((doc) => page(doc.path, `${doc.title} · fxbot docs`, doc.description || about, <DocPage doc={doc} />)),
    ...sdk.map((doc) => page(doc.path, `${doc.title} · fxbot SDK`, doc.description || about, <DocPage doc={doc} />)),
    {
      file: "404.html",
      url: undefined,
      head: `<title>Not found · fxbot</title>\n    <meta name="robots" content="noindex" />`,
      body: renderToStaticMarkup(<NotFound />),
    },
  ];
}

// What search engines read: a sitemap of every page but the 404, and robots.txt, which points at it.
export function searchFiles(list = pages()) {
  const urls = list.flatMap((page) => (page.url ? [`  <url><loc>${page.url}</loc></url>`] : []));
  return {
    "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
    "robots.txt": `User-agent: *\nAllow: /\n\nSitemap: ${url("sitemap.xml")}\n`,
  };
}
