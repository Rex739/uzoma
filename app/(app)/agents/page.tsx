import { CheckCircle2, Cpu, Radio } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui";
import { agents } from "@/lib/mock-data";
export default function AgentsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Specialist network"
        title="Purpose-built delivery agents"
        description="A small, accountable team with one clear responsibility at each stage of the contract delivery lifecycle."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {agents.map((agent, i) => (
          <article className="surface p-6" key={agent.id}>
            <div className="flex items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-cyan/20 bg-cyan/5 font-mono text-lg font-semibold text-cyan">
                {agent.name[0]}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-white">{agent.name}</h2>
                  <span className="flex items-center gap-1.5 text-[10px] text-emerald">
                    <span className="size-1.5 rounded-full bg-emerald" />
                    {agent.availability}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-slate-400">
                  {agent.role}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  {agent.description}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {agent.capabilities.map((c) => (
                <Badge key={c}>{c}</Badge>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
              <div className="bg-[#080d14] p-4">
                <p className="eyebrow">Completed jobs</p>
                <p className="mt-2 text-lg font-semibold">
                  {agent.completedJobs}
                </p>
              </div>
              <div className="bg-[#080d14] p-4">
                <p className="eyebrow">Demo quote</p>
                <p className="mt-2 text-xs font-semibold text-gold">
                  {agent.quote}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge tone="cyan">
                <Cpu className="mr-1 size-3" />
                MCP Service Profile
              </Badge>
              <Badge tone="gold">
                <Radio className="mr-1 size-3" />
                x402-ready · future integration
              </Badge>
            </div>
            <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[10px] text-slate-600">
              <CheckCircle2 className="size-3 text-emerald" />
              Deterministic demo response profile{" "}
              {String(i + 1).padStart(2, "0")}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
