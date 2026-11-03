import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { changelogPath, docs, groups, sdk, sdkGroups, type Doc } from "./content.ts";
import { Shell } from "./layout.tsx";
import { href, repo } from "./site.ts";

// The set a page is in: the docs, or the SDK's.
const sets = {
  docs: { label: "Docs", pages: docs, groups },
  sdk: { label: "SDK", pages: sdk, groups: sdkGroups },
};
const setOf = (doc: Doc) => sets[doc.root];

function DocLink({ doc, current }: { doc: Doc; current: Doc }) {
  const active = doc === current;
  return (
    <a href={href(doc.path)} aria-current={active ? "page" : undefined} className={`-mx-2 block rounded-md px-2 py-1.5 transition-colors ${active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {doc.label}
    </a>
  );
}

const find = (pages: Doc[], slug: string) => pages.find((doc) => doc.slug === slug)!;

function Sidebar({ current }: { current: Doc }) {
  const { label, pages, groups } = setOf(current);
  return (
    <nav aria-label={label} className="grid gap-6 text-sm">
      <DocLink doc={find(pages, "")} current={current} />
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground/80">{group.title}</p>
          <ul className="grid gap-0.5">
            {group.pages.map((page) => (
              <li key={page.slug}>
                <DocLink doc={find(pages, page.slug)} current={current} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// A set's home lists the four kinds, each with its pages.
function Kinds({ doc }: { doc: Doc }) {
  const { pages, groups } = setOf(doc);
  return (
    <div className="mt-8 grid max-w-[46rem] gap-3 sm:grid-cols-2">
      {groups.map((group) => (
        <section key={group.title} className="rounded-xl border p-5">
          <h2 className="font-semibold">{group.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{group.about}</p>
          <ul className="mt-3 grid gap-1 text-sm">
            {group.pages.map((page) => (
              <li key={page.slug}>
                <a className="underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground" href={href(find(pages, page.slug).path)}>
                  {page.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Neighbour({ doc, next }: { doc?: Doc; next?: boolean }) {
  if (!doc) return <span />;
  return (
    <a href={href(doc.path)} className={`group grid gap-1 rounded-xl border p-4 transition-colors hover:bg-muted/60 ${next ? "text-right" : ""}`}>
      <span className={`flex items-center gap-1 text-xs text-muted-foreground ${next ? "justify-end" : ""}`}>
        {!next && <ChevronLeft aria-hidden="true" className="size-3.5" />}
        {next ? "Next" : "Previous"}
        {next && <ChevronRight aria-hidden="true" className="size-3.5" />}
      </span>
      <span className="font-medium">{doc.label}</span>
    </a>
  );
}

// A page of the docs or the SDK's: the sidebar, a menu in its place on a phone, the page, and its headings on a wide
// screen.
export function DocPage({ doc }: { doc: Doc }) {
  const { label, pages, groups } = setOf(doc);
  const index = pages.indexOf(doc);
  const kind = groups.find((group) => group.pages.some((page) => page.slug === doc.slug))?.title;
  return (
    <Shell section={doc.path === changelogPath ? "changelog" : doc.root}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[12rem_minmax(0,1fr)_11rem]">
        <aside className="hidden lg:block">
          <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto py-10">
            <Sidebar current={doc} />
          </div>
        </aside>
        <main className="min-w-0 py-6 lg:py-10">
          <details className="docs-menu mb-8 rounded-xl border lg:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm">
              <span className="shrink-0 text-muted-foreground">{kind ?? label}</span>
              <span aria-hidden="true" className="text-muted-foreground/60">/</span>
              <span className="min-w-0 truncate font-medium">{doc.label}</span>
              <ChevronDown aria-hidden="true" className="docs-menu-chevron ml-auto size-4 text-muted-foreground transition-transform" />
            </summary>
            <div className="border-t px-4 py-4">
              <Sidebar current={doc} />
            </div>
          </details>
          {kind && <p className="mb-3 hidden text-sm font-medium text-muted-foreground lg:block">{kind}</p>}
          <article className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} />
          {!doc.slug && <Kinds doc={doc} />}
          {doc.path === changelogPath && (
            <p className="mt-8 text-sm text-muted-foreground">
              Each release is also on{" "}
              <a className="underline underline-offset-4 hover:text-foreground" href={`${repo}/releases`}>
                GitHub Releases
              </a>
              , with its section here as its notes.
            </p>
          )}
          <nav aria-label="Previous and next" className="mt-12 grid grid-cols-2 gap-3 border-t pt-6">
            <Neighbour doc={pages[index - 1]} />
            <Neighbour doc={pages[index + 1]} next />
          </nav>
        </main>
        {doc.headings.length > 1 && (
          <aside className="hidden xl:block">
            <nav aria-label="On this page" className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto py-10 text-sm">
              <p className="mb-2 text-xs font-medium text-muted-foreground/80">On this page</p>
              <ul className="grid gap-1.5">
                {doc.headings.map((heading) => (
                  <li key={heading.id}>
                    <a href={`#${heading.id}`} className="block text-muted-foreground transition-colors hover:text-foreground">
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
    </Shell>
  );
}
