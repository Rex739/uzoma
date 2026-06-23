import {
  Bot,
  Braces,
  CircleDollarSign,
  Database,
  Fingerprint,
  RadioTower,
  Workflow,
} from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui";

const stack = [
  {
    name: "Build Request",
    sub: "Intent + acceptance criteria",
    icon: Braces,
    status: "Implemented locally",
  },
  {
    name: "Lead Agent",
    sub: "Plans and routes specialist work",
    icon: Workflow,
    status: "Local orchestration",
  },
  {
    name: "MCP-discovered Specialists",
    sub: "Atlas · Forge · Sentinel · Verity",
    icon: Bot,
    status: "Planned architecture",
  },
  {
    name: "x402 Delivery Receipts",
    sub: "Per-artifact delivery accounting",
    icon: CircleDollarSign,
    status: "Planned architecture",
  },
  {
    name: "Artifact Hashes",
    sub: "Stable evidence references",
    icon: Fingerprint,
    status: "Implemented locally",
  },
  {
    name: "Odra Dossier Registry",
    sub: "Live Build Dossier proof registry",
    icon: Database,
    status: "Deployed on Casper Testnet",
  },
  {
    name: "Casper Event Stream / Proof Layer",
    sub: "Queryable accepted dossier evidence",
    icon: RadioTower,
    status: "Live Testnet Proof",
  },
];
export default function ArchitecturePage() {
  return (
    <>
      <PageHeading
        eyebrow="System architecture"
        title="Casper integration architecture"
        description="Uzoma runs a local multi-agent delivery workflow with live Casper Testnet dossier anchoring. MCP discovery and x402 settlement remain integration architecture."
      />
      <div className="rounded-xl border border-gold/20 bg-gold/5 p-4 text-xs leading-6 text-slate-400">
        <strong className="text-gold">Live boundary:</strong> The Odra registry
        and demo dossier proof are live on Casper Testnet. Agent orchestration
        remains local; MCP discovery, browser wallet signing, and x402
        settlement are planned architecture.
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stack.map(({ name, sub, icon: Icon, status }, i) => (
          <div
            className={`surface min-h-44 p-5 ${status === "Implemented locally" ? "border-emerald/20" : status === "Local orchestration" ? "border-cyan/20" : status === "Deployed on Casper Testnet" || status === "Live Testnet Proof" ? "border-gold/25" : ""}`}
            key={name}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid size-9 place-items-center rounded-lg border border-line bg-[#080d14]">
                <Icon className="size-4 text-cyan" />
              </div>
              <span className="font-mono text-[9px] text-slate-700">
                0{i + 1}
                {i < stack.length - 1 ? " →" : ""}
              </span>
            </div>
            <h2 className="mt-6 text-sm font-semibold text-white">{name}</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">{sub}</p>
            <Badge
              className="mt-4"
              tone={
                status === "Implemented locally"
                  ? "green"
                  : status === "Local orchestration"
                    ? "cyan"
                    : status === "Deployed on Casper Testnet" ||
                        status === "Live Testnet Proof"
                      ? "gold"
                      : "slate"
              }
            >
              {status}
            </Badge>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="surface p-5">
          <p className="eyebrow">Discovery layer</p>
          <h3 className="mt-3 text-sm font-semibold">MCP service profiles</h3>
          <p className="mt-2 text-xs leading-6 text-slate-500">
            The lead agent can discover bounded specialist capabilities, input
            schemas, and delivery terms.
          </p>
        </div>
        <div className="surface p-5">
          <p className="eyebrow">Delivery layer</p>
          <h3 className="mt-3 text-sm font-semibold">x402-ready receipts</h3>
          <p className="mt-2 text-xs leading-6 text-slate-500">
            Future receipts can bind delivery identity to a payment flow.
            Current IDs and amounts are mock data only.
          </p>
        </div>
        <div className="surface p-5">
          <p className="eyebrow">Proof layer</p>
          <h3 className="mt-3 text-sm font-semibold">Odra on Casper</h3>
          <p className="mt-2 text-xs leading-6 text-slate-500">
            The live Testnet registry anchors dossier hashes and emits accepted
            proof events without placing source artifacts on-chain.
          </p>
          <Badge className="mt-4" tone="gold">
            Live Testnet registry
          </Badge>
        </div>
      </div>
    </>
  );
}
