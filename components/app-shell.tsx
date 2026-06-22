"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  BriefcaseBusiness,
  Clock3,
  GitBranch,
  Menu,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAppState } from "@/components/state-provider";

const links = [
  { href: "/workspace", label: "Workspace", icon: BriefcaseBusiness },
  { href: "/jobs", label: "Jobs", icon: GitBranch },
  { href: "/agents", label: "Specialist Agents", icon: Bot },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/architecture", label: "Architecture", icon: GitBranch },
];

function Sidebar({ close }: { close?: () => void }) {
  const path = usePathname();
  const { reset } = useAppState();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-5 py-[18px]">
        <Brand />
      </div>
      <nav
        className="flex-1 space-y-1 px-3 py-5"
        aria-label="Primary navigation"
      >
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={close}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
              path === href || (href === "/jobs" && path.startsWith("/jobs/"))
                ? "bg-cyan/10 text-cyan"
                : "text-slate-500 hover:bg-white/[.035] hover:text-slate-200",
            )}
          >
            <Icon className="size-4" />
            <span>{label}</span>
            {href === "/activity" && (
              <span className="ml-auto size-1.5 rounded-full bg-cyan" />
            )}
          </Link>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <Button
          variant="ghost"
          className="w-full justify-start text-xs"
          onClick={() => {
            if (confirm("Reset all local demo progress?")) reset();
          }}
        >
          <RotateCcw className="size-3.5" />
          Reset demo data
        </Button>
        <p className="px-3 pb-1 pt-2 font-mono text-[9px] uppercase tracking-widest text-slate-700">
          Local demo · v0.1
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () =>
      setTime(
        new Intl.DateTimeFormat("en", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="min-h-screen bg-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-[#080d14] lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <aside className="relative h-full w-72 border-r border-line bg-[#080d14]">
            <button
              className="absolute right-3 top-4 z-10 p-2 text-slate-400"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </button>
            <Sidebar close={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <header className="fixed inset-x-0 top-0 z-20 flex h-[69px] items-center justify-between border-b border-line bg-ink/90 px-4 backdrop-blur lg:left-60 lg:px-7">
        <div className="flex items-center gap-3">
          <button
            className="p-2 text-slate-400 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <div>
            <p className="text-sm font-medium text-white">
              Core Protocol Workspace
            </p>
            <p className="hidden text-[11px] text-slate-600 sm:block">
              Structured contract delivery
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <Badge tone="cyan">Demo Mode</Badge>
          <span className="hidden items-center gap-2 text-xs text-slate-400 md:flex">
            <span className="size-1.5 rounded-full bg-emerald shadow-[0_0_8px_#34d399]" />
            4 agents online
          </span>
          <span className="hidden items-center gap-2 font-mono text-[11px] text-slate-600 sm:flex">
            <Clock3 className="size-3" />
            {time}
          </span>
        </div>
      </header>
      <main className="min-h-screen pt-[69px] lg:pl-60">
        <div className="mx-auto max-w-[1440px] p-5 sm:p-7 lg:p-9">
          {children}
        </div>
      </main>
    </div>
  );
}
