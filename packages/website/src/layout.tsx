import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Blob } from "./blob.tsx";
import { buttonVariants } from "./components/ui/button.tsx";
import { changelogPath } from "./content.ts";
import { href, repo } from "./site.ts";

// GitHub's mark, which Lucide no longer ships.
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Header({ section }: { section?: "docs" | "changelog" }) {
  const link = (active: boolean) => `rounded-md px-2.5 py-1.5 transition-colors hover:text-foreground ${active ? "text-foreground" : "text-muted-foreground"}`;
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <a href={href("/")} className="flex items-center gap-2 font-semibold tracking-tight">
          <Blob shape="circle" color="black" size={26} follow />
          fxbot
        </a>
        <nav aria-label="Site" className="flex items-center text-sm">
          <a href={href("/docs/")} className={link(section === "docs")} aria-current={section === "docs" ? "page" : undefined}>
            Docs
          </a>
          <a href={href(changelogPath)} className={link(section === "changelog")} aria-current={section === "changelog" ? "page" : undefined}>
            Changelog
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <a href={repo} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="fxbot on GitHub" title="fxbot on GitHub">
            <GitHubMark />
          </a>
          <button type="button" data-theme-toggle hidden className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Switch between light and dark" title="Switch between light and dark">
            <Sun aria-hidden="true" className="theme-light" />
            <Moon aria-hidden="true" className="theme-dark" />
          </button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          fxbot is open source, under the <a className="underline underline-offset-4 hover:text-foreground" href={`${repo}/blob/main/LICENSE`}>Apache License 2.0</a>. It runs on{" "}
          <a className="underline underline-offset-4 hover:text-foreground" href="https://fx.sh/docs/lib">
            libfx
          </a>
          .
        </p>
        <nav aria-label="Footer" className="flex gap-4">
          <a className="hover:text-foreground" href={href("/docs/")}>
            Docs
          </a>
          <a className="hover:text-foreground" href={href(changelogPath)}>
            Changelog
          </a>
          <a className="hover:text-foreground" href={repo}>
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}

// Every page: the header, its content, and the footer.
export function Shell({ section, children }: { section?: "docs" | "changelog"; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Header section={section} />
      <div id="content" className="flex-1">
        {children}
      </div>
      <Footer />
    </div>
  );
}
