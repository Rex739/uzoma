import { CasperSignatureHarness } from "@/components/casper-signature-harness";

export default function CasperSignatureHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="grid-bg flex min-h-screen items-center justify-center bg-ink px-5 text-white">
        <section className="max-w-lg rounded-2xl border border-line bg-[#0b111b]/90 p-6 text-center">
          <p className="eyebrow text-slate-500">Internal diagnostic</p>
          <h1 className="mt-3 text-xl font-semibold">Unavailable in production</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            This Casper Wallet signature harness is disabled outside local
            development and never submits transactions.
          </p>
        </section>
      </main>
    );
  }

  return <CasperSignatureHarness />;
}
