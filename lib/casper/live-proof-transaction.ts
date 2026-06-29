import type * as CasperSdkTypes from "casper-js-sdk";
import * as casperSdkModule from "casper-js-sdk";

const CasperSdk = (
  "default" in casperSdkModule
    ? casperSdkModule.default
    : casperSdkModule
) as unknown as typeof CasperSdkTypes;

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

export type AnchorDossierTransactionInput = {
  signerPublicKey: string;
  jobId: string;
  dossierHash: string;
  artifactRootHash: string;
  artifactCount: number;
  paymentAmount: number | string;
};

export type AnchorDossierPayloadPreview = {
  packageHash: typeof LIVE_PROOF_ANCHOR_CONFIG.packageHash;
  chain: typeof LIVE_PROOF_ANCHOR_CONFIG.chainName;
  entryPoint: typeof LIVE_PROOF_ANCHOR_CONFIG.entryPoint;
  jobId: string;
  dossierHash: string;
  artifactRootHash: string;
  artifactCount: number;
  signerPublicKey: string;
  paymentAmount: string;
};

export type TransactionV1Json = {
  Version1: unknown;
};

export type AnchorDossierTransactionResult = {
  transactionV1Json: TransactionV1Json;
  payloadPreview: AnchorDossierPayloadPreview;
  transactionHash: string;
  unsigned: true;
};

function requireNonEmpty(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function normalizePaymentAmount(value: number | string) {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new Error("paymentAmount must be a positive integer in motes");
  }
  const asNumber = Number(text);
  if (!Number.isSafeInteger(asNumber) || asNumber < 1) {
    throw new Error("paymentAmount must be a safe positive integer in motes");
  }
  return { text, number: asNumber };
}

function parseSignerPublicKey(value: string) {
  const trimmed = requireNonEmpty(value, "signerPublicKey");
  try {
    return CasperSdk.PublicKey.fromHex(trimmed);
  } catch {
    throw new Error("signerPublicKey must be a valid Casper public key hex");
  }
}

export function buildAnchorDossierTransaction(
  input: AnchorDossierTransactionInput,
): AnchorDossierTransactionResult {
  const signerPublicKey = parseSignerPublicKey(input.signerPublicKey);
  const jobId = requireNonEmpty(input.jobId, "jobId");
  const dossierHash = requireNonEmpty(input.dossierHash, "dossierHash");
  const artifactRootHash = requireNonEmpty(
    input.artifactRootHash,
    "artifactRootHash",
  );
  if (!Number.isInteger(input.artifactCount) || input.artifactCount < 1) {
    throw new Error("artifactCount must be an integer greater than zero");
  }
  const paymentAmount = normalizePaymentAmount(input.paymentAmount);

  const transaction = new CasperSdk.ContractCallBuilder()
    .from(signerPublicKey)
    .byPackageHash(LIVE_PROOF_ANCHOR_CONFIG.packageHashBytes)
    .entryPoint(LIVE_PROOF_ANCHOR_CONFIG.entryPoint)
    .runtimeArgs(
      CasperSdk.Args.fromMap({
        job_id: CasperSdk.CLValue.newCLString(jobId),
        dossier_hash: CasperSdk.CLValue.newCLString(dossierHash),
        artifact_root_hash: CasperSdk.CLValue.newCLString(artifactRootHash),
        artifact_count: CasperSdk.CLValue.newCLUInt32(input.artifactCount),
      }),
    )
    .payment(paymentAmount.number, LIVE_PROOF_ANCHOR_CONFIG.gasPriceTolerance)
    .chainName(LIVE_PROOF_ANCHOR_CONFIG.chainName)
    .build();

  const transactionV1 = transaction.getTransactionV1();
  if (!transactionV1) {
    throw new Error("Casper SDK did not build a TransactionV1");
  }
  transaction.validate();

  return {
    transactionV1Json: {
      Version1: transaction.toJSON(),
    },
    transactionHash: transaction.hash.toHex(),
    unsigned: true,
    payloadPreview: {
      packageHash: LIVE_PROOF_ANCHOR_CONFIG.packageHash,
      chain: LIVE_PROOF_ANCHOR_CONFIG.chainName,
      entryPoint: LIVE_PROOF_ANCHOR_CONFIG.entryPoint,
      jobId,
      dossierHash,
      artifactRootHash,
      artifactCount: input.artifactCount,
      signerPublicKey: signerPublicKey.toHex(),
      paymentAmount: paymentAmount.text,
    },
  };
}
