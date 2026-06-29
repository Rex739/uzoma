import type { BuildDossier, BrowserCasperAnchorProof } from "@/lib/types";

export const CSPR_LIVE_TESTNET_DEPLOY_URL =
  "https://testnet.cspr.live/deploy" as const;

export type LiveProofAnchorState =
  | "ready"
  | "wallet-connecting"
  | "reviewing"
  | "awaiting-wallet-approval"
  | "submitted"
  | "confirming-on-casper"
  | "confirmed"
  | "rejected"
  | "failed"
  | "unverified";

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

export function isLegacyDossier(dossier: BuildDossier) {
  return (
    dossier.dossierHashVersion === "legacy-static-v1" ||
    dossier.artifactRootHashVersion === "legacy-static-v1"
  );
}

export function isValidMotesPaymentAmount(value: string) {
  return /^[1-9][0-9]*$/.test(value.trim());
}

export function abbreviatePublicKey(value: string) {
  return `${value.slice(0, 12)}…${value.slice(-10)}`;
}
