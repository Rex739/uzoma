import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  FileCheck2,
  Fingerprint,
  GitBranch,
  ShieldCheck,
  TerminalSquare,
  Workflow,
} from "lucide-react";
import { Brand } from "@/components/brand";
import {
  HeaderReveal,
  HoverLift,
  MotionPressable,
  ProgressLine,
  ProofCardReveal,
  RevealOnScroll,
  StaggerContainer,
  StaggerItem,
} from "@/components/landing-motion";
import { Badge, Button } from "@/components/ui";
import { WorkflowCarousel } from "@/components/workflow-carousel";

const flow = ["Request", "Plan", "Build", "Test", "Review", "Dossier"];
export default function Landing() {
  return (
    <div className="min-h-screen overflow-hidden bg-ink">
      <HeaderReveal className="fixed inset-x-0 top-0 z-30 border-b border-white/[.06] bg-ink/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Brand responsive />
          <nav className="hidden items-center gap-7 text-xs text-slate-500 sm:flex">
            <a href="#workflow" className="hover:text-white">
              Workflow
            </a>
            <a href="#agents" className="hover:text-white">
              Agents
            </a>
            <a href="#proof" className="hover:text-white">
              Dossiers
            </a>
          </nav>
          <MotionPressable kind="secondary">
            <Button asChild variant="secondary" size="sm">
              <Link href="/workspace">
                Open Workspace <ArrowRight className="size-3" />
              </Link>
            </Button>
          </MotionPressable>
        </div>
      </HeaderReveal>
      <main>
        <section className="grid-bg relative flex min-h-[780px] items-center border-b border-line px-5 pt-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(35,213,245,.09),transparent_42%)]" />
          <StaggerContainer
            className="relative mx-auto w-full max-w-7xl py-28 text-center"
            stagger={0.1}
          >
            <StaggerItem>
              <Badge tone="cyan">Agent-native delivery workspace</Badge>
            </StaggerItem>
            <StaggerItem>
              <h1 className="display-hero mx-auto mt-8 max-w-5xl text-balance">
                AI agents that ship
                <br />
                <span className="text-cyan">verifiable</span> on-chain work.
              </h1>
            </StaggerItem>
            <StaggerItem>
              <p className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-7 text-slate-400 sm:text-lg">
                Uzoma turns smart-contract requests into structured specialist
                workflows, accepted artifacts, and verifiable build dossiers.
              </p>
            </StaggerItem>
            <StaggerItem>
              <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
                <MotionPressable className="w-full sm:w-auto">
                  <Button asChild size="lg" className="w-full">
                    <Link href="/workspace">
                      Open Workspace <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </MotionPressable>
                <MotionPressable kind="secondary" className="w-full sm:w-auto">
                  <Button
                    asChild
                    size="lg"
                    variant="secondary"
                    className="w-full"
                  >
                    <Link href="/dossier/demo-escrow">View Demo Dossier</Link>
                  </Button>
                </MotionPressable>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="mx-auto mt-10 max-w-sm rounded-xl border border-cyan/15 bg-[#090f17]/90 px-4 py-4 md:hidden">
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-cyan">
                  Live delivery workflow
                </p>
                <p className="mt-2 whitespace-nowrap font-mono text-[clamp(8.5px,2.75vw,11px)] font-semibold tracking-tight text-slate-200">
                  Request → Plan → Build → Verify → Anchor
                </p>
                <StaggerContainer
                  className="mt-3 flex flex-wrap justify-center gap-1.5"
                  stagger={0.06}
                  delay={0.08}
                >
                  {[
                    "Live agent plan",
                    "Independent review",
                    "Testnet proof",
                  ].map((status) => (
                    <StaggerItem compact key={status}>
                      <span className="block rounded-full border border-cyan/15 bg-cyan/[.05] px-2.5 py-1 font-mono text-[8px] font-semibold uppercase tracking-wider text-slate-400">
                        {status}
                      </span>
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              </div>
              <div className="mx-auto mt-20 hidden max-w-4xl rounded-2xl border border-line bg-[#090f17]/90 p-2 shadow-glow md:block">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="size-2 rounded-full bg-slate-700" />
                    <span className="size-2 rounded-full bg-slate-700" />
                    <span className="size-2 rounded-full bg-slate-700" />
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-slate-600">
                    delivery run · demo-escrow
                  </span>
                  <span className="size-2 rounded-full bg-emerald" />
                </div>
                <StaggerContainer
                  className="grid gap-2 p-4 sm:grid-cols-6"
                  stagger={0.07}
                  delay={0.12}
                >
                  {flow.map((item, i) => (
                    <StaggerItem compact key={item}>
                      <div className="relative rounded-lg border border-line bg-panel px-2 py-4 text-left">
                        <span className="font-mono text-[9px] text-slate-700">
                          0{i + 1}
                        </span>
                        <p className="mt-3 text-xs font-semibold text-slate-300">
                          {item}
                        </p>
                        <ProgressLine
                          delay={0.32 + i * 0.06}
                          className={`mt-3 h-0.5 ${i < 5 ? "bg-cyan" : "bg-gold"}`}
                        />
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </section>
        <section className="mx-auto grid max-w-7xl gap-16 px-5 py-28 lg:grid-cols-2 lg:items-center">
          <RevealOnScroll>
            <p className="eyebrow">The delivery gap</p>
            <h2 className="display-section mt-4 max-w-2xl">
              Generated code is easy. Accountable delivery is not.
            </h2>
            <p className="mt-5 max-w-lg leading-7 text-slate-400">
              AI can produce a contract in seconds, but production work needs
              explicit criteria, specialist ownership, independent validation,
              and evidence you can inspect later.
            </p>
          </RevealOnScroll>
          <StaggerContainer
            inView
            className="grid gap-3 sm:grid-cols-2"
            stagger={0.08}
          >
            {[
              [
                TerminalSquare,
                "Opaque output",
                "A code block is not a verifiable delivery record.",
              ],
              [
                ShieldCheck,
                "No independent proof",
                "Builders should not be the only reviewers of their own work.",
              ],
              [
                GitBranch,
                "Lost context",
                "Requirements drift when planning, implementation, and review are disconnected.",
              ],
              [
                Fingerprint,
                "Unverifiable history",
                "Accepted artifacts need stable hashes, receipts, and approval evidence.",
              ],
            ].map(([Icon, title, copy]) => {
              const C = Icon as typeof TerminalSquare;
              return (
                <StaggerItem key={String(title)}>
                  <HoverLift className="surface h-full p-5">
                    <C className="size-5 text-slate-500" />
                    <h3 className="mt-5 text-sm font-semibold">
                      {String(title)}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {String(copy)}
                    </p>
                  </HoverLift>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </section>
        <WorkflowCarousel />
        <section id="agents" className="mx-auto max-w-7xl px-5 py-28">
          <RevealOnScroll className="text-center">
            <p className="eyebrow">Specialist network</p>
            <h2 className="display-section mt-4">
              The right agent for each decision.
            </h2>
          </RevealOnScroll>
          <StaggerContainer
            inView
            className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4"
            stagger={0.08}
          >
            {[
              [
                Boxes,
                "Atlas",
                "Specification",
                "Turns product intent into scoped acceptance criteria.",
              ],
              [
                TerminalSquare,
                "Forge",
                "Implementation",
                "Builds contract artifacts against the approved specification.",
              ],
              [
                Workflow,
                "Sentinel",
                "Testing",
                "Validates success paths, failure paths, and edge cases.",
              ],
              [
                ShieldCheck,
                "Verity",
                "Independent review",
                "Independently checks the evidence before delivery is accepted.",
              ],
            ].map(([Icon, name, role, description]) => {
              const C = Icon as typeof Boxes;
              return (
                <StaggerItem key={String(name)}>
                  <HoverLift className="surface h-full p-6">
                    <div className="flex size-10 items-center justify-center rounded-lg border border-cyan/20 bg-cyan/5">
                      <C className="size-5 text-cyan" />
                    </div>
                    <h3 className="mt-8 font-semibold text-white">
                      {String(name)}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {String(role)}
                    </p>
                    <p className="mt-4 min-h-12 text-xs leading-5 text-slate-500">
                      {String(description)}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2">
                      <Badge>MCP Service Profile</Badge>
                      <Badge tone="cyan">Delivery-ready service</Badge>
                    </div>
                  </HoverLift>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </section>
        <section
          id="proof"
          className="border-y border-line bg-[#090e15] px-5 py-28"
        >
          <StaggerContainer
            inView
            className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center"
            stagger={0.1}
          >
            <StaggerItem>
              <ProofCardReveal className="surface overflow-hidden">
                <div className="border-b border-line p-5">
                  <Badge tone="gold">Approved dossier</Badge>
                  <h3 className="mt-5 text-xl font-semibold">
                    Milestone Escrow Contract
                  </h3>
                </div>
                {[
                  "Specification",
                  "Implementation",
                  "Test report",
                  "Independent review",
                ].map((x, i) => (
                  <div
                    key={x}
                    className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0"
                  >
                    <FileCheck2 className="size-4 text-emerald" />
                    <span className="text-sm">{x}</span>
                    <span className="ml-auto font-mono text-[10px] text-slate-600">
                      sha256:…{1327 + i * 231}
                    </span>
                  </div>
                ))}
              </ProofCardReveal>
            </StaggerItem>
            <StaggerItem>
              <p className="eyebrow">VERIFIABLE BUILD DOSSIERS</p>
              <h2 className="display-section mt-4 max-w-xl">
                Evidence that survives the conversation.
              </h2>
              <p className="mt-5 max-w-lg leading-7 text-slate-400">
                Every dossier binds the brief, criteria, agent assignments,
                artifact hashes, delivery receipts, and final approval into one
                inspectable record.
              </p>
              <div className="mt-7 rounded-lg border border-gold/20 bg-gold/5 p-4 text-sm text-gold">
                Every dossier is structured for Casper anchoring, preserving
                artifact hashes, delivery receipts, acceptance criteria, and
                final approval evidence from the start.
              </div>
            </StaggerItem>
          </StaggerContainer>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-28">
          <RevealOnScroll className="relative overflow-hidden rounded-2xl border border-cyan/20 bg-[#0b131d] px-7 py-16 text-center sm:px-16">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(35,213,245,.11),transparent_50%)]" />
            <div className="relative">
              <p className="eyebrow">Casper-native architecture preview</p>
              <h2 className="display-section mx-auto mt-4 max-w-3xl">
                Turn agent output into accepted, verifiable delivery.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-slate-400">
                Run the complete local workflow today, then inspect how each
                accepted artifact becomes a portable Build Dossier.
              </p>
              <MotionPressable className="mt-8">
                <Button asChild size="lg">
                  <Link href="/jobs/demo-escrow">
                    Open Milestone Escrow Workflow
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </MotionPressable>
            </div>
          </RevealOnScroll>
        </section>
      </main>
      <footer className="border-t border-line px-5 py-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
            <div>
              <Brand />
              <p className="mt-4 max-w-sm text-xs leading-5 text-slate-600">
                Agent-native delivery infrastructure for verifiable on-chain
                work.
              </p>
            </div>
            <nav
              aria-label="Footer navigation"
              className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-slate-500"
            >
              <Link href="/workspace" className="transition hover:text-white">
                Workspace
              </Link>
              <Link href="/agents" className="transition hover:text-white">
                Agents
              </Link>
              <Link
                href="/dossier/demo-escrow"
                className="transition hover:text-white"
              >
                Demo Dossier
              </Link>
              <Link
                href="/architecture"
                className="transition hover:text-white"
              >
                Architecture
              </Link>
              <a
                href="https://github.com/Rex739/uzoma"
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-white"
              >
                GitHub
              </a>
            </nav>
          </div>
          <div className="mt-9 border-t border-line pt-5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-slate-700">
              Verifiable agent delivery · Local workflow
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
