"use client";

import { ArrowLeft, ArrowRight, Check, FileCheck2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type WorkflowStage = {
  number: string;
  title: string;
  status: string;
  description: string;
  evidenceLabel: string;
  evidence: string;
  final?: boolean;
};

const stages: readonly WorkflowStage[] = [
  {
    number: "01",
    title: "Request",
    status: "Captured",
    description:
      "Define the contract objective, constraints, target chain, and acceptance criteria.",
    evidenceLabel: "Brief state",
    evidence: "scope.locked",
  },
  {
    number: "02",
    title: "Plan",
    status: "Scoped",
    description:
      "The Lead Agent scopes the work, assigns specialists, and turns the brief into verifiable deliverables.",
    evidenceLabel: "Assignment manifest",
    evidence: "agents: 3 assigned",
  },
  {
    number: "03",
    title: "Build",
    status: "Produced",
    description:
      "Specialist agents produce contracts, interfaces, scripts, and implementation artifacts.",
    evidenceLabel: "Build output",
    evidence: "artifact_count: 12",
  },
  {
    number: "04",
    title: "Test",
    status: "Validated",
    description:
      "Execution results, test coverage, and validation outputs are attached to the job record.",
    evidenceLabel: "Validation run",
    evidence: "13 / 13 checks passed",
  },
  {
    number: "05",
    title: "Review",
    status: "Approved",
    description:
      "Verifier agents inspect evidence against the defined acceptance criteria before approval.",
    evidenceLabel: "Verifier receipt",
    evidence: "evidence verified",
  },
  {
    number: "06",
    title: "Dossier",
    status: "Finalized",
    description:
      "A signed on-chain dossier anchors the final artifacts, proofs, hashes, and approval receipt.",
    evidenceLabel: "Casper proof",
    evidence: "hash anchored on Casper",
    final: true,
  },
];

export function WorkflowCarousel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollTo = useCallback((index: number) => {
    const viewport = viewportRef.current;
    const slide = viewport?.children[index] as HTMLElement | undefined;
    const firstSlide = viewport?.children[0] as HTMLElement | undefined;
    if (!viewport || !slide || !firstSlide) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    viewport.scrollTo({
      left: slide.offsetLeft - firstSlide.offsetLeft,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateSelected = () => {
      const atEnd =
        viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 2;
      if (atEnd) {
        setSelectedIndex(stages.length - 1);
        return;
      }
      const slides = Array.from(viewport.children) as HTMLElement[];
      const firstSlideOffset = slides[0]?.offsetLeft ?? 0;
      const nearest = slides.reduce(
        (best, slide, index) => {
          const distance = Math.abs(
            slide.offsetLeft - firstSlideOffset - viewport.scrollLeft,
          );
          return distance < best.distance ? { index, distance } : best;
        },
        { index: 0, distance: Number.POSITIVE_INFINITY },
      );
      setSelectedIndex(nearest.index);
    };

    updateSelected();
    viewport.addEventListener("scroll", updateSelected, { passive: true });
    return () => viewport.removeEventListener("scroll", updateSelected);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollTo(Math.min(selectedIndex + 1, stages.length - 1));
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollTo(Math.max(selectedIndex - 1, 0));
    }
    if (event.key === "Home") {
      event.preventDefault();
      scrollTo(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      scrollTo(stages.length - 1);
    }
  };

  return (
    <section
      id="workflow"
      aria-labelledby="workflow-heading"
      className="overflow-hidden border-y border-line bg-[#090e15] px-5 py-24 sm:py-28"
    >
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] lg:items-center lg:gap-16">
        <div className="lg:py-8">
          <p className="eyebrow">One controlled workflow</p>
          <h2 id="workflow-heading" className="display-workflow mt-5 max-w-xl">
            From request to proof,
            <br className="hidden sm:block" /> every handoff is explicit.
          </h2>
          <p className="mt-6 max-w-md text-sm leading-7 text-slate-400">
            Uzoma’s Lead Agent turns high-stakes DeFi and RWA briefs into
            acceptance criteria and specialist assignments. Verity reviews the
            resulting evidence before final approval.
          </p>

          <div className="mt-9 flex items-center gap-3">
            <button
              type="button"
              aria-label="Previous workflow stage"
              disabled={selectedIndex === 0}
              onClick={() => scrollTo(selectedIndex - 1)}
              className="flex size-11 items-center justify-center rounded-full border border-line bg-[#0c131d] text-slate-300 transition hover:border-slate-500 hover:bg-[#121c28] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next workflow stage"
              disabled={selectedIndex === stages.length - 1}
              onClick={() => scrollTo(selectedIndex + 1)}
              className="flex size-11 items-center justify-center rounded-full border border-line bg-[#0c131d] text-slate-300 transition hover:border-cyan/50 hover:bg-cyan/5 hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
            <span
              className="ml-2 font-mono text-[11px] tracking-[.14em] text-slate-500"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="text-slate-200">
                {stages[selectedIndex].number}
              </span>
              <span className="mx-2 text-slate-700">/</span>06
            </span>
          </div>
        </div>

        <div className="workflow-bleed-right min-w-0">
          <div
            ref={viewportRef}
            role="region"
            aria-roledescription="carousel"
            aria-label="Workflow stages"
            tabIndex={0}
            onKeyDown={onKeyDown}
            className="workflow-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50"
          >
            {stages.map((stage, index) => (
              <article
                key={stage.title}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${stages.length}: ${stage.title}`}
                className={cn(
                  "relative flex h-[470px] min-w-0 flex-none basis-[91%] snap-start scroll-ml-0 flex-col overflow-hidden rounded-xl border border-line bg-[#0c131d] p-6 sm:h-[460px] sm:basis-[76%] sm:p-7 md:basis-[79%] lg:basis-[72%] xl:basis-[65%]",
                  stage.final &&
                    "border-gold/30 bg-[#10151b] shadow-[inset_0_1px_0_rgba(35,213,245,.1)]",
                )}
              >
                <div
                  className={cn(
                    "absolute inset-x-0 top-0 h-px bg-cyan/40",
                    stage.final &&
                      "bg-gradient-to-r from-cyan/70 via-gold/80 to-transparent",
                  )}
                />
                <div className="flex items-start justify-between gap-4">
                  <span
                    className={cn(
                      "font-mono text-5xl font-medium tracking-[-.08em] text-slate-700/80",
                      stage.final && "text-gold/70",
                    )}
                  >
                    {stage.number}
                  </span>
                  <span
                    className={cn(
                      "mt-1 inline-flex items-center gap-1.5 border border-cyan/15 bg-cyan/[.06] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[.14em] text-cyan",
                      stage.final && "border-gold/25 bg-gold/[.07] text-gold",
                    )}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {stage.status}
                  </span>
                </div>

                <div className="mt-14 border-t border-line pt-6">
                  <p className="font-mono text-[9px] uppercase tracking-[.18em] text-slate-600">
                    Workflow stage / {stage.number}
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem]">
                    {stage.title}
                  </h3>
                  <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
                    {stage.description}
                  </p>
                </div>

                <div
                  className={cn(
                    "mt-auto border border-line bg-[#080d14] p-4",
                    stage.final && "border-gold/20 bg-gold/[.035]",
                  )}
                >
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <span className="font-mono text-[9px] uppercase tracking-[.16em] text-slate-600">
                      {stage.evidenceLabel}
                    </span>
                    {stage.final ? (
                      <FileCheck2
                        className="size-3.5 text-gold"
                        aria-hidden="true"
                      />
                    ) : (
                      <Check
                        className="size-3.5 text-emerald"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full bg-cyan",
                        stage.final && "bg-gold",
                      )}
                    />
                    <code
                      className={cn(
                        "text-[11px] text-slate-300",
                        stage.final && "text-gold",
                      )}
                    >
                      {stage.evidence}
                    </code>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[.14em] text-slate-600">
            Drag or use arrow keys to inspect the delivery record
          </p>
        </div>
      </div>
    </section>
  );
}
