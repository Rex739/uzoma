import {
  supportsTransactionV1,
  type CasperWalletConnection,
} from "@/lib/casper/casper-wallet-client";
import type { LiveProofAnchorState } from "@/lib/casper/live-proof";

const BLOCKED_ACTION_STATES = new Set<LiveProofAnchorState>([
  "connecting-wallet",
  "awaiting-wallet-approval",
  "submitting",
  "submitted",
  "verifying",
  "confirmed",
]);

export type LiveAnchorActionGateInput = {
  paymentPolicyValid: boolean;
  connection: CasperWalletConnection | null;
  eligibilityReady: boolean;
  anchorEligible: boolean;
  unsignedTransactionReady: boolean;
  state: LiveProofAnchorState;
};

export function getLiveAnchorActionGates(input: LiveAnchorActionGateInput) {
  const busy = BLOCKED_ACTION_STATES.has(input.state);
  const activePublicKey = input.connection?.publicKey?.trim() ?? "";
  const walletConnected = Boolean(activePublicKey);
  const transactionV1Supported = supportsTransactionV1(input.connection?.supports);
  const evidenceReady =
    input.eligibilityReady &&
    input.anchorEligible &&
    input.unsignedTransactionReady;
  const connectEnabled =
    input.paymentPolicyValid &&
    !walletConnected &&
    !busy &&
    input.state !== "signed";
  const reviewVisible =
    walletConnected ||
    input.state === "awaiting-wallet-approval" ||
    input.state === "signing-cancelled" ||
    input.state === "signed";
  const reviewEnabled =
    input.paymentPolicyValid &&
    walletConnected &&
    transactionV1Supported &&
    evidenceReady &&
    !busy &&
    input.state !== "signed";

  return {
    busy,
    connectEnabled,
    walletConnected,
    transactionV1Supported,
    evidenceReady,
    reviewVisible,
    reviewEnabled,
  };
}
