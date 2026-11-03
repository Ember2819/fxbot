import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";

// A screen's top bar: the sidebar's button, then its title. Plugins' screens use it too.
export function Header({ title, lead, children }: { title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="box-content flex h-14 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
      <SidebarTrigger />
      {lead}
      <h1 className="min-w-0 flex-1 truncate font-medium">{title}</h1>
      {children}
    </header>
  );
}
