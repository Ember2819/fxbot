import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Blob } from "./blob.tsx";
import { docs } from "./content.ts";
import { DocPage } from "./docs.tsx";
import { Home } from "./home.tsx";
import { Shell } from "./layout.tsx";
import { href } from "./site.ts";

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

// Every page of the site: the file it is written to in out/, what goes in its <head>, and its <body>.
export function pages() {
  const page = (file: string, title: string, description: string, body: ReactElement) => ({
    file,
    head: `<title>${escape(title)}</title>\n    <meta name="description" content="${escape(description)}" />`,
    body: renderToStaticMarkup(body),
  });
  const about = "fxbot is your bot, built and configured how you want it: a lean, local-first core that works with local models and grows with the add-ons you pick.";
  return [
    page("index.html", "fxbot: your bot, built how you want it", about, <Home />),
    ...docs.map((doc) => page(`${doc.path}index.html`, `${doc.title} · fxbot docs`, doc.description || about, <DocPage doc={doc} />)),
    page("404.html", "Not found · fxbot", about, <NotFound />),
  ];
}
