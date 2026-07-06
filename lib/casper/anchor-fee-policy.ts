export const REVIEWED_TESTNET_ANCHOR_FEE_POLICY = {
  network: "casper-test",
  paymentAmountMotes: "20000000000",
  pricingMode: "PaymentLimited",
  gasPriceTolerance: 1,
  standardPayment: true,
  paymentSource: "Known successful BuildDossierRegistry anchor transaction",
  sourceTransactionHash:
    "770848c2ac6d2ef68133e03b7e567f2dec4bb255f34b9c79128174e5e2527658",
  reviewLabel: "Reviewed Testnet anchor payment budget",
} as const;

export type AnchorFeePolicy = typeof REVIEWED_TESTNET_ANCHOR_FEE_POLICY;
export type AnchorFeePolicyDetail = {
  label: string;
  value: string;
  copyable?: boolean;
};

export function isValidAnchorFeePolicy(
  policy: {
    network?: string;
    paymentAmountMotes?: string;
    sourceTransactionHash?: string;
  },
) {
  const paymentAmountMotes = policy.paymentAmountMotes ?? "";
  const sourceTransactionHash = policy.sourceTransactionHash ?? "";
  return (
    policy.network === "casper-test" &&
    /^[1-9][0-9]*$/.test(paymentAmountMotes) &&
    /^[0-9a-f]{64}$/i.test(sourceTransactionHash)
  );
}

export function getAnchorFeePolicyDetails({
  expanded,
  policy = REVIEWED_TESTNET_ANCHOR_FEE_POLICY,
}: {
  expanded: boolean;
  policy?: AnchorFeePolicy;
}): AnchorFeePolicyDetail[] {
  if (!expanded) return [];
  return [
    { label: "Network", value: "Casper Testnet" },
    { label: "Policy", value: "Registry anchor budget v1" },
    {
      label: "Validation basis",
      value: "Validated against the deployed BuildDossierRegistry anchor configuration",
    },
    {
      label: "Reference transaction",
      value: policy.sourceTransactionHash,
      copyable: true,
    },
  ];
}
