export const LIVE_PROOF_ANCHOR_CONFIG = {
  packageHash:
    "hash-c1e00c7784953c4a944f76adf4cd3ef87745c97e60ebcd5667737af425574f80",
  packageHashBytes:
    "c1e00c7784953c4a944f76adf4cd3ef87745c97e60ebcd5667737af425574f80",
  chainName: "casper-test",
  entryPoint: "anchor_dossier",
  runtime: "VmCasperV1",
  pricingMode: "PaymentLimited",
  gasPriceTolerance: 1,
  standardPayment: true,
  target: "Stored/ByPackageHash",
} as const;
