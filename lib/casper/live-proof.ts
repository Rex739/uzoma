import type { BuildDossier, BrowserCasperAnchorProof } from "@/lib/types";

export const CSPR_LIVE_TESTNET_DEPLOY_URL =
  "https://testnet.cspr.live/deploy" as const;

export type LiveProofAnchorState =
  | "not-anchored"
  | "ready"
  | "connecting-wallet"
  | "wallet-connected"
  | "reviewing"
  | "awaiting-wallet-approval"
  | "signing-cancelled"
  | "signed"
  | "submitting"
  | "submitted"
  | "verifying"
  | "confirmed"
  | "unverified"
  | "failed";

export type AnchorVerificationInput = {
  transactionHash: string;
  expectedJobId: string;
  expectedDossierHash: string;
  expectedArtifactRootHash: string;
  expectedArtifactCount: number;
  expectedPackageHash: string;
};

export type AnchorVerificationResponse =
  | {
      status: "confirmed";
      proof: BrowserCasperAnchorProof;
    }
  | {
      status: "unverified" | "failed";
      code: string;
      message: string;
      transactionHash?: string;
    };

export function getCsprLiveDeployUrl(transactionHash: string) {
  return `${CSPR_LIVE_TESTNET_DEPLOY_URL}/${transactionHash}`;
}

export function isPreservedDemoEscrowDossier(dossier: BuildDossier) {
  return dossier.id === "demo-escrow" && dossier.jobId === "demo-escrow";
}

export function isLegacyStaticDossierEvidence(dossier: BuildDossier) {
  return (
    dossier.dossierHashVersion === "legacy-static-v1" ||
    dossier.artifactRootHashVersion === "legacy-static-v1" ||
    isPreservedDemoEscrowDossier(dossier)
  );
}

export const isLegacyDossier = isLegacyStaticDossierEvidence;

export function normalizeLegacyStaticDossierEvidence(
  dossier: BuildDossier,
): BuildDossier {
  if (!isPreservedDemoEscrowDossier(dossier)) return dossier;
  return {
    ...dossier,
    dossierHashVersion: "legacy-static-v1",
    artifactRootHashVersion: "legacy-static-v1",
  };
}

export function getDossierReferenceCopy(dossier: BuildDossier) {
  if (isLegacyStaticDossierEvidence(dossier)) {
    return {
      label: "LEGACY DOSSIER REFERENCE",
      copyLabel: "Copy reference",
      supportingCopy:
        "Preserved historical delivery reference linked to a confirmed Casper Testnet anchor. This record predates Uzoma’s canonical Live Proof hashing system.",
    };
  }

  return {
    label: "DETERMINISTIC DOSSIER HASH",
    copyLabel: "Copy hash",
    supportingCopy:
      "Stable local reference binding the accepted brief, evidence, artifact hashes, and final approval.",
  };
}

export function isValidMotesPaymentAmount(value: string) {
  return /^[1-9][0-9]*$/.test(value.trim());
}

export function abbreviatePublicKey(value: string) {
  return `${value.slice(0, 12)}…${value.slice(-10)}`;
}
