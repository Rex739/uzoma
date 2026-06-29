"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import {
  getCsprClickConfigIssue,
  getCsprClickRuntimeDiagnostics,
  getCsprClickRuntimeStatus,
  getLoadedCsprClickRuntime,
  inspectTransactionV1Capability,
  type CsprClickRuntimeStatus,
} from "@/lib/casper/csprclick-client";

type DiagnosticState =
  | "idle"
  | "checking-runtime"
  | "passed"
  | "failed";

function labelForStatus(status: CsprClickRuntimeStatus) {
  const labels: Record<CsprClickRuntimeStatus, string> = {
    "app-id-missing": "CSPR.CLICK APP ID NOT CONFIGURED",
    "browser-unavailable": "BROWSER RUNTIME UNAVAILABLE",
    "runtime-loader-blocked": "IMMUTABLE RUNTIME LOADER NOT VERIFIED",
    "runtime-unloaded": "CSPR.CLICK RUNTIME NOT LOADED",
    "runtime-api-unsupported": "CSPR.CLICK API SHAPE UNSUPPORTED",
    "runtime-api-compatible": "CSPR.CLICK API SHAPE COMPATIBLE",
    "provider-unavailable": "CASPER WALLET NOT DETECTED",
    "transactionv1-unknown": "TRANSACTIONV1 CAPABILITY NOT TESTED",
  };
  return labels[status];
}

function statusTone(status: CsprClickRuntimeStatus) {
  if (status === "runtime-api-compatible") return "green" as const;
  if (status === "runtime-unloaded") return "slate" as const;
  return "amber" as const;
}

export function LiveProofDiagnostics() {
  const [state, setState] = useState<DiagnosticState>("idle");
  const [status, setStatus] = useState<CsprClickRuntimeStatus>(() =>
    getCsprClickRuntimeStatus(),
  );
  const [message, setMessage] = useState("");
  const [transactionV1Capability, setTransactionV1Capability] =
    useState("not-tested");

  const diagnostics = getCsprClickRuntimeDiagnostics();
  const configIssue = getCsprClickConfigIssue();

  async function inspectRuntime() {
    setMessage("");
    setTransactionV1Capability("not-tested");
    if (configIssue) {
      setStatus("app-id-missing");
      setState("failed");
      setMessage("CSPR.CLICK APP ID NOT CONFIGURED");
      return;
    }
    try {
      setState("checking-runtime");
      const sdk = getLoadedCsprClickRuntime();
      if (!sdk) {
        setStatus(getCsprClickRuntimeStatus());
        setState("failed");
        setMessage("NO IMMUTABLE RUNTIME LOAD WAS ATTEMPTED");
        return;
      }
      if (!sdk.isProviderPresent(diagnostics.providerKey)) {
        setStatus("provider-unavailable");
        setState("failed");
        setMessage("RUNTIME API COMPATIBLE · CASPER WALLET NOT DETECTED");
        return;
      }
      const capability = await inspectTransactionV1Capability(sdk);
      setTransactionV1Capability(capability);
      setStatus(
        capability === "unknown"
          ? "transactionv1-unknown"
          : "runtime-api-compatible",
      );
      setState("passed");
      setMessage("RUNTIME API SHAPE CHECK COMPLETE · NO CONNECTION REQUESTED");
    } catch (error) {
      setState("failed");
      const text = error instanceof Error ? error.message : "";
      setStatus(/unsupported/i.test(text) ? "runtime-api-unsupported" : status);
      setMessage("CSPR.CLICK RUNTIME DIAGNOSTIC FAILED");
    }
  }

  return (
    <main className="min-h-screen bg-bg p-4 text-white sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-2xl border border-cyan/20 bg-panel p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="eyebrow text-cyan">Internal live proof diagnostics</p>
              <h1 className="mt-3 text-2xl font-semibold">
                CSPR.click browser runtime smoke test
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Development-only check for runtime version alignment, API shape,
                provider presence, and future TransactionV1 capability. It does
                not request a wallet connection.
              </p>
            </div>
            <Badge tone={statusTone(status)}>{labelForStatus(status)}</Badge>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge tone="green">NO TRANSACTION REQUESTED</Badge>
            <Badge tone="green">NO SIGNATURE REQUESTED</Badge>
            <Badge tone="green">NO TESTNET WRITE</Badge>
          </div>
        </section>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {[
            ["Browser/client safe", String(diagnostics.browserRuntime)],
            ["CSPR.click configured", String(diagnostics.configured)],
            ["Pinned type/runtime version", diagnostics.runtimeVersion],
            ["Loader strategy", diagnostics.loaderStrategy],
            [
              "Immutable loader verified",
              String(diagnostics.officialImmutableLoaderVerified),
            ],
            ["Runtime global present", String(diagnostics.globalClientPresent)],
            [
              "Runtime API compatible",
              String(diagnostics.apiCheck.compatible),
            ],
            [
              "Missing API methods",
              diagnostics.apiCheck.missingMethods.join(", ") || "None",
            ],
            ["Provider", diagnostics.providerKey],
            ["Provider availability", diagnostics.providerAvailability],
            ["Required capability", diagnostics.requiredSupport],
            ["TransactionV1 capability", transactionV1Capability],
            ["Network", diagnostics.chainName],
            ["Runtime loading", "Disabled until an immutable official URL is verified"],
          ].map(([label, value]) => (
            <div className="bg-panel p-4" key={label}>
              <p className="eyebrow">{label}</p>
              <p className="mt-2 break-all font-mono text-xs text-slate-300">
                {value}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-line bg-panel p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-white">
                Explicit runtime-only diagnostic
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Checks an already-present browser runtime for required methods
                and provider metadata. Because no official immutable runtime URL
                has been verified, this page does not load the CDN script,
                connect, sign, or send.
              </p>
            </div>
            <Button
              onClick={inspectRuntime}
              loading={state === "checking-runtime"}
            >
              <ShieldCheck className="size-4" />
              Inspect loaded runtime
            </Button>
          </div>
          {message && (
            <p
              className={`mt-4 text-xs font-semibold uppercase tracking-wider ${
                state === "passed" ? "text-emerald" : "text-gold"
              }`}
            >
              {message}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
