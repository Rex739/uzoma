import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnchorDossierTransaction,
  LIVE_PROOF_ANCHOR_CONFIG,
  type AnchorDossierTransactionInput,
} from "../lib/casper/live-proof-transaction";

const validInput: AnchorDossierTransactionInput = {
  signerPublicKey:
    "011111111111111111111111111111111111111111111111111111111111111111",
  jobId: "demo-escrow",
  dossierHash:
    "sha256:uzoma-dossier-demo-escrow4fd18b4fd18b4fd18b4fd18b4fd18b4fd18b4fd",
  artifactRootHash:
    "sha256:43b5d9face5f64d5009b8e3b02aff9ec8d7185c76ed0db58940a802d8ad108d4",
  artifactCount: 4,
  paymentAmount: "20000000000",
};

type TransactionV1 = {
  Version1: {
    hash: string;
    payload: {
      initiator_addr: { PublicKey: string };
      pricing_mode: {
        PaymentLimited: {
          gas_price_tolerance: number;
          payment_amount: number;
          standard_payment: boolean;
        };
      };
      chain_name: string;
      fields: {
        args: {
          Named: [
            string,
            {
              bytes: string;
              cl_type: string;
              parsed?: unknown;
            },
          ][];
        };
        target: {
          Stored: {
            id: {
              ByPackageHash: {
                addr: string;
                version?: number | null;
              };
            };
            runtime: string;
          };
        };
        entry_point: { Custom: string };
        scheduling: string;
      };
    };
    approvals: unknown[];
  };
};

function transactionJson(input: AnchorDossierTransactionInput = validInput) {
  return buildAnchorDossierTransaction(input).transactionV1Json as TransactionV1;
}

function namedArgs(transaction: TransactionV1) {
  return new Map(transaction.Version1.payload.fields.args.Named);
}

test("constructs the canonical unsigned TransactionV1 package call", () => {
  const result = buildAnchorDossierTransaction(validInput);
  const transaction = result.transactionV1Json as TransactionV1;
  const version = transaction.Version1;
  const payload = version.payload;
  const fields = payload.fields;
  const args = namedArgs(transaction);

  assert.equal(payload.chain_name, "casper-test");
  assert.equal(payload.chain_name, LIVE_PROOF_ANCHOR_CONFIG.chainName);
  assert.equal(fields.entry_point.Custom, "anchor_dossier");
  assert.equal(fields.entry_point.Custom, LIVE_PROOF_ANCHOR_CONFIG.entryPoint);
  assert.equal(fields.target.Stored.runtime, "VmCasperV1");
  assert.equal(fields.target.Stored.runtime, LIVE_PROOF_ANCHOR_CONFIG.runtime);
  assert.equal(
    fields.target.Stored.id.ByPackageHash.addr,
    LIVE_PROOF_ANCHOR_CONFIG.packageHashBytes,
  );
  assert.equal(fields.target.Stored.id.ByPackageHash.version ?? null, null);
  assert.deepEqual(version.approvals, []);
  assert.equal(result.unsigned, true);
  assert.match(version.hash, /^[0-9a-f]{64}$/i);
  assert.equal(result.transactionHash, version.hash);

  assert.equal(args.get("job_id")?.cl_type, "String");
  assert.equal(args.get("dossier_hash")?.cl_type, "String");
  assert.equal(args.get("artifact_root_hash")?.cl_type, "String");
  assert.equal(args.get("artifact_count")?.cl_type, "U32");
  assert.equal(args.get("artifact_count")?.bytes, "04000000");
  assert.equal(args.size, 4);
});

test("matches canonical CLI anchor pricing and target intent", () => {
  const transaction = transactionJson();
  const pricing = transaction.Version1.payload.pricing_mode.PaymentLimited;

  assert.equal(pricing.payment_amount, Number(validInput.paymentAmount));
  assert.equal(pricing.gas_price_tolerance, 1);
  assert.equal(pricing.standard_payment, true);
  assert.equal(
    transaction.Version1.payload.fields.target.Stored.id.ByPackageHash.addr,
    "c1e00c7784953c4a944f76adf4cd3ef87745c97e60ebcd5667737af425574f80",
  );
  assert.equal(
    transaction.Version1.payload.fields.entry_point.Custom,
    "anchor_dossier",
  );
});

test("returns a public payload preview without signing or submission fields", () => {
  const result = buildAnchorDossierTransaction(validInput);

  assert.deepEqual(result.payloadPreview, {
    packageHash:
      "hash-c1e00c7784953c4a944f76adf4cd3ef87745c97e60ebcd5667737af425574f80",
    chain: "casper-test",
    entryPoint: "anchor_dossier",
    jobId: validInput.jobId,
    dossierHash: validInput.dossierHash,
    artifactRootHash: validInput.artifactRootHash,
    artifactCount: 4,
    signerPublicKey: validInput.signerPublicKey,
    paymentAmount: "20000000000",
  });
  assert.equal(JSON.stringify(result.transactionV1Json).includes("secret"), false);
  assert.equal(JSON.stringify(result.transactionV1Json).includes("wallet"), false);
});

test("produces serializable TransactionV1 JSON shaped for later wallet approval", () => {
  const result = buildAnchorDossierTransaction(validInput);
  const serialized = JSON.stringify(result.transactionV1Json);
  const parsed = JSON.parse(serialized) as TransactionV1;

  assert.ok(parsed.Version1);
  assert.equal(Array.isArray(parsed.Version1.approvals), true);
  assert.equal(parsed.Version1.approvals.length, 0);
  assert.equal(parsed.Version1.payload.chain_name, "casper-test");
});

test("rejects invalid anchor transaction inputs", () => {
  assert.throws(
    () => buildAnchorDossierTransaction({ ...validInput, jobId: " " }),
    /jobId is required/,
  );
  assert.throws(
    () => buildAnchorDossierTransaction({ ...validInput, dossierHash: "" }),
    /dossierHash is required/,
  );
  assert.throws(
    () =>
      buildAnchorDossierTransaction({ ...validInput, artifactRootHash: "" }),
    /artifactRootHash is required/,
  );
  assert.throws(
    () => buildAnchorDossierTransaction({ ...validInput, artifactCount: 0 }),
    /artifactCount must be an integer greater than zero/,
  );
  assert.throws(
    () =>
      buildAnchorDossierTransaction({
        ...validInput,
        signerPublicKey: "not-a-public-key",
      }),
    /signerPublicKey must be a valid Casper public key hex/,
  );
  assert.throws(
    () => buildAnchorDossierTransaction({ ...validInput, paymentAmount: "" }),
    /paymentAmount must be a positive integer in motes/,
  );
});
