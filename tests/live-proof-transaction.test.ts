import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, test } from "node:test";
import type * as CasperSdkTypes from "casper-js-sdk";
import * as casperSdkModule from "casper-js-sdk";
import { POST as submitAnchorPost } from "../app/api/casper/submit-anchor/route";
import { REVIEWED_TESTNET_ANCHOR_FEE_POLICY } from "../lib/casper/anchor-fee-policy";
import {
  applyWalletSignatureToAnchorTransaction,
  buildAnchorDossierUnsignedTransaction,
  buildAnchorDossierTransaction,
  getSignedAnchorApprovalSummary,
  LIVE_PROOF_ANCHOR_CONFIG,
  type AnchorDossierTransactionInput,
} from "../lib/casper/live-proof-transaction";
import {
  canonicalizeCasperPublicKey,
  getSignedTransactionApprovalDiagnostic,
  getSignedTransactionBoundaryDiagnostic,
  publicKeysMatch,
} from "../lib/casper/signed-transaction-diagnostics";
import {
  assertAccountPutTransactionEnvelope,
  buildAccountPutTransactionRequest,
  getAccountPutTransactionEnvelopeDiagnostic,
  relaySignedAnchorTransaction,
  validateSignedAnchorTransaction,
} from "../lib/casper/submit-anchor-relay";

const CasperSdk = (
  "default" in casperSdkModule
    ? casperSdkModule.default
    : casperSdkModule
) as unknown as typeof CasperSdkTypes;

const validInput: AnchorDossierTransactionInput = {
  signerPublicKey:
    "011111111111111111111111111111111111111111111111111111111111111111",
  jobId: "demo-escrow",
  dossierHash:
    "sha256:uzoma-dossier-demo-escrow4fd18b4fd18b4fd18b4fd18b4fd18b4fd18b4fd",
  artifactRootHash:
    "sha256:43b5d9face5f64d5009b8e3b02aff9ec8d7185c76ed0db58940a802d8ad108d4",
  artifactCount: 4,
  paymentAmount: REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes,
};
const testSignature = Uint8Array.from({ length: 64 }, (_, index) => index);
const testSignatureHex = [...testSignature]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

function generateSecp256k1PublicKeyStartingWith(prefix: "02" | "03") {
  for (let index = 0; index < 500; index += 1) {
    const key = CasperSdk.PrivateKey.generate(CasperSdk.KeyAlgorithm.SECP256K1)
      .publicKey
      .toHex()
      .toLowerCase();
    if (key.slice(2, 4) === prefix) return key;
  }
  throw new Error(`Could not generate Secp256k1 public key starting ${prefix}`);
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

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

function expectedMetadata(input: AnchorDossierTransactionInput = validInput) {
  return {
    jobId: input.jobId,
    dossierHash: input.dossierHash,
    artifactRootHash: input.artifactRootHash,
    artifactCount: input.artifactCount,
    expectedPackageHash: LIVE_PROOF_ANCHOR_CONFIG.packageHash,
    expectedNetwork: LIVE_PROOF_ANCHOR_CONFIG.chainName,
  };
}

function signedAnchorTransaction(input: AnchorDossierTransactionInput = validInput) {
  const transaction = structuredClone(
    buildAnchorDossierTransaction(input).transactionV1Json.Version1,
  ) as TransactionV1["Version1"];
  transaction.approvals = [
    {
      signer: input.signerPublicKey,
      signature: `01${"a".repeat(128)}`,
    },
  ];
  return transaction;
}

function signedAnchorTransactionWithApproval(approval: Record<string, unknown>) {
  const transaction = structuredClone(
    buildAnchorDossierTransaction(validInput).transactionV1Json.Version1,
  ) as TransactionV1["Version1"];
  transaction.approvals = [approval];
  return transaction;
}

function expectRelayValidationCode(
  signedTransaction: unknown,
  code: string,
  expected = expectedMetadata(),
) {
  assert.throws(
    () => validateSignedAnchorTransaction({ signedTransaction, expected }),
    (error) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === code,
  );
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

  assert.equal(
    pricing.payment_amount,
    Number(REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes),
  );
  assert.equal(pricing.gas_price_tolerance, 1);
  assert.equal(
    pricing.gas_price_tolerance,
    REVIEWED_TESTNET_ANCHOR_FEE_POLICY.gasPriceTolerance,
  );
  assert.equal(pricing.standard_payment, true);
  assert.equal(
    pricing.standard_payment,
    REVIEWED_TESTNET_ANCHOR_FEE_POLICY.standardPayment,
  );
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
    paymentAmount: REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes,
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

test("server relay rejects unsigned anchor transactions", async () => {
  const unsigned = transactionJson().Version1;
  const request = new Request("http://localhost/api/casper/submit-anchor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      signedTransaction: unsigned,
      expected: expectedMetadata(),
    }),
  });

  const response = await submitAnchorPost(request);
  const json = (await response.json()) as {
    status: string;
    code: string;
    diagnostic?: {
      serverObservedApprovalCount: number;
      approvalContainerPath: string | null;
      transactionVariant: string;
      failureCode?: string;
    };
  };

  assert.equal(response.status, 400);
  assert.equal(json.status, "failed");
  assert.equal(json.code, "NO_APPROVALS");
  assert.equal(json.diagnostic?.serverObservedApprovalCount, 0);
  assert.equal(json.diagnostic?.approvalContainerPath, "approvals");
  assert.equal(json.diagnostic?.transactionVariant, "TransactionV1");
  assert.equal(json.diagnostic?.failureCode, "NO_APPROVALS");
});

test("SDK signed TransactionV1 serialization survives relay boundary parsing", () => {
  const unsigned = buildAnchorDossierUnsignedTransaction(validInput);
  const unsignedJson = unsigned.transaction.toJSON();
  const signed = applyWalletSignatureToAnchorTransaction({
    transaction: unsigned.transaction,
    signatureResponse: {
      cancelled: false,
      signatureHex: testSignatureHex,
      signature: testSignature,
    },
    signingPublicKeyHex: validInput.signerPublicKey,
    expected: unsigned.payloadPreview,
  });
  const signedJson = signed.toJSON();
  const parsedSignedJson = JSON.parse(JSON.stringify(signedJson));
  const signedDiagnostic =
    getSignedTransactionBoundaryDiagnostic(parsedSignedJson);
  const unsignedDiagnostic = getSignedTransactionBoundaryDiagnostic(
    JSON.parse(JSON.stringify(unsignedJson)),
  );

  assert.equal(unsignedDiagnostic.approvalCount, 0);
  assert.equal(unsignedDiagnostic.approvalContainerPath, "approvals");
  assert.equal(signedDiagnostic.transactionVariant, "TransactionV1");
  assert.equal(signedDiagnostic.approvalContainerPath, "approvals");
  assert.ok(signedDiagnostic.approvalCount >= 1);
  assert.equal(signedDiagnostic.hasSigner, true);
  assert.equal(signedDiagnostic.hasNonEmptySignature, true);
  assert.equal(signedDiagnostic.payloadShapeValid, true);
  assert.deepEqual(
    getSignedTransactionApprovalDiagnostic({
      transactionJson: parsedSignedJson,
      connectedPublicKey: validInput.signerPublicKey,
    }),
    {
      approvalCount: 1,
      approvalKeys: ["signature", "signer"],
      signerPresent: true,
      signaturePresent: true,
      signerMatchesInitiator: true,
      signerMatchesConnectedAccount: true,
      signerFormat: "tagged",
      signatureFormat: "hex",
      signerFieldName: "signer",
      signatureFieldName: "signature",
      transactionInitiatorFormat: "tagged",
      failureCode: undefined,
    },
  );
  assert.doesNotThrow(() =>
    validateSignedAnchorTransaction({
      signedTransaction: parsedSignedJson,
      expected: expectedMetadata(),
    }),
  );
  expectRelayValidationCode(
    JSON.parse(JSON.stringify(unsignedJson)),
    "NO_APPROVALS",
  );
});

test("wrapper instance setSignature is the production wallet attachment path", () => {
  const unsigned = buildAnchorDossierUnsignedTransaction(validInput);
  const unsignedJson = unsigned.transaction.toJSON() as { approvals?: unknown[] };

  assert.equal(unsignedJson.approvals?.length, 0);

  const result = unsigned.transaction.setSignature(
    testSignature,
    CasperSdk.PublicKey.fromHex(validInput.signerPublicKey),
  );

  const signedJson = unsigned.transaction.toJSON() as { approvals?: unknown[] };
  const summary = getSignedAnchorApprovalSummary({
    transactionJson: signedJson,
    expectedSignerPublicKey: validInput.signerPublicKey,
  });

  assert.equal(result, undefined);
  assert.equal(signedJson.approvals?.length, 1);
  assert.deepEqual(summary, {
    approvalCount: 1,
    signerMatches: true,
    signaturePresent: true,
  });
  assert.doesNotThrow(() =>
    validateSignedAnchorTransaction({
      signedTransaction: signedJson,
      expected: {
        jobId: validInput.jobId,
        dossierHash: validInput.dossierHash,
        artifactRootHash: validInput.artifactRootHash,
        artifactCount: validInput.artifactCount,
        expectedPackageHash: LIVE_PROOF_ANCHOR_CONFIG.packageHash,
        expectedNetwork: LIVE_PROOF_ANCHOR_CONFIG.chainName,
      },
    }),
  );
});

test("SDK canonicalizes Ed25519 and Secp256k1 Casper public keys exactly", () => {
  const ed25519Key = validInput.signerPublicKey;
  const secp02Key = generateSecp256k1PublicKeyStartingWith("02");
  const secp03Key = generateSecp256k1PublicKeyStartingWith("03");
  const differentSecpKey = generateSecp256k1PublicKeyStartingWith("02");

  assert.equal(canonicalizeCasperPublicKey(ed25519Key), ed25519Key);
  assert.equal(canonicalizeCasperPublicKey(`public-key:${ed25519Key}`), ed25519Key);
  assert.equal(canonicalizeCasperPublicKey(`hex:${secp02Key}`), secp02Key);
  assert.equal(canonicalizeCasperPublicKey(secp02Key), secp02Key);
  assert.equal(canonicalizeCasperPublicKey(secp03Key), secp03Key);
  assert.equal(secp02Key.length, 68);
  assert.equal(secp03Key.length, 68);
  assert.equal(secp02Key.slice(0, 4), "0202");
  assert.equal(secp03Key.slice(0, 4), "0203");
  assert.equal(publicKeysMatch(`public-key:${secp02Key}`, secp02Key), true);
  assert.equal(publicKeysMatch(secp02Key, differentSecpKey), false);
  assert.equal(canonicalizeCasperPublicKey(ed25519Key.slice(2)), null);
  assert.equal(canonicalizeCasperPublicKey(secp02Key.slice(2)), null);
});

test("SDK-signed Secp256k1 transaction passes signer structural checks", () => {
  const secpPublicKey = generateSecp256k1PublicKeyStartingWith("02");
  const unsigned = buildAnchorDossierUnsignedTransaction({
    ...validInput,
    signerPublicKey: secpPublicKey,
  });
  const unsignedPayload = JSON.stringify(
    (unsigned.transaction.toJSON() as { payload: unknown }).payload,
  );

  unsigned.transaction.setSignature(
    testSignature,
    CasperSdk.PublicKey.fromHex(secpPublicKey),
  );

  const signedJson = unsigned.transaction.toJSON() as {
    approvals?: unknown[];
    payload?: unknown;
  };
  const approval = getSignedTransactionApprovalDiagnostic({
    transactionJson: signedJson,
    connectedPublicKey: secpPublicKey,
  });
  const boundary = getSignedTransactionBoundaryDiagnostic(signedJson);
  const payloadUnchanged =
    JSON.stringify(signedJson.payload) === unsignedPayload;
  const finalStructuralValidity =
    boundary.payloadShapeValid &&
    boundary.approvalCount >= 1 &&
    approval.signerPresent &&
    approval.signaturePresent &&
    approval.signerMatchesInitiator &&
    approval.signerMatchesConnectedAccount === true &&
    payloadUnchanged;

  assert.equal(boundary.approvalCount, 1);
  assert.equal(approval.signerMatchesInitiator, true);
  assert.equal(approval.signerMatchesConnectedAccount, true);
  assert.equal(payloadUnchanged, true);
  assert.equal(finalStructuralValidity, true);
});

test("relay approval diagnostics use specific failure codes", () => {
  expectRelayValidationCode(
    signedAnchorTransactionWithApproval({
      signature: `01${"a".repeat(128)}`,
    }),
    "APPROVAL_SIGNER_MISSING",
  );
  expectRelayValidationCode(
    signedAnchorTransactionWithApproval({
      signer: validInput.signerPublicKey,
    }),
    "APPROVAL_SIGNATURE_MISSING",
  );
  expectRelayValidationCode(
    signedAnchorTransactionWithApproval({
      signer: "not-a-public-key",
      signature: `01${"a".repeat(128)}`,
    }),
    "APPROVAL_SHAPE_UNSUPPORTED",
  );
  expectRelayValidationCode(
    signedAnchorTransactionWithApproval({
      signer: validInput.signerPublicKey,
      signature: { bytes: "not-supported" },
    }),
    "APPROVAL_SHAPE_UNSUPPORTED",
  );
});

test("relay signer normalization rejects ambiguous untagged public keys", () => {
  const untaggedSigner = validInput.signerPublicKey.slice(2);
  expectRelayValidationCode(
    signedAnchorTransactionWithApproval({
      signer: untaggedSigner,
      signature: `01${"a".repeat(128)}`,
    }),
    "APPROVAL_SHAPE_UNSUPPORTED",
  );
  assert.equal(
    getSignedTransactionApprovalDiagnostic({
      transactionJson: signedAnchorTransactionWithApproval({
        signer: untaggedSigner,
        signature: `01${"a".repeat(128)}`,
      }),
      connectedPublicKey: validInput.signerPublicKey,
    }).signerMatchesConnectedAccount,
    false,
  );
});

test("server relay validates signed TransactionV1 anchor invariants before RPC", () => {
  expectRelayValidationCode(
    {
      ...signedAnchorTransaction(),
      payload: {
        ...signedAnchorTransaction().payload,
        chain_name: "casper-mainnet",
      },
    },
    "CHAIN_MISMATCH",
  );

  const wrongPackage = signedAnchorTransaction();
  wrongPackage.payload.fields.target.Stored.id.ByPackageHash.addr = "b".repeat(64);
  expectRelayValidationCode(wrongPackage, "PACKAGE_HASH_MISMATCH");

  const wrongEntryPoint = signedAnchorTransaction();
  wrongEntryPoint.payload.fields.entry_point.Custom = "transfer";
  expectRelayValidationCode(wrongEntryPoint, "ENTRY_POINT_MISMATCH");

  const wrongPayment = signedAnchorTransaction();
  wrongPayment.payload.pricing_mode.PaymentLimited.payment_amount = 1;
  expectRelayValidationCode(wrongPayment, "PAYMENT_BUDGET_MISMATCH");

  const missingApproval = signedAnchorTransaction();
  missingApproval.approvals = [];
  expectRelayValidationCode(missingApproval, "NO_APPROVALS");

  const wrongSigner = signedAnchorTransaction();
  wrongSigner.approvals = [
    {
      signer:
        "012222222222222222222222222222222222222222222222222222222222222222",
      signature: `01${"a".repeat(128)}`,
    },
  ];
  expectRelayValidationCode(wrongSigner, "APPROVAL_SIGNER_MISMATCH");
});

test("server relay rejects changed anchor evidence metadata", () => {
  const signedTransaction = signedAnchorTransaction();

  expectRelayValidationCode(signedTransaction, "JOB_ID_MISMATCH", {
    ...expectedMetadata(),
    jobId: "other-job",
  });
  expectRelayValidationCode(signedTransaction, "DOSSIER_HASH_MISMATCH", {
    ...expectedMetadata(),
    dossierHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  expectRelayValidationCode(signedTransaction, "ARTIFACT_ROOT_MISMATCH", {
    ...expectedMetadata(),
    artifactRootHash:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });
  expectRelayValidationCode(signedTransaction, "ARTIFACT_COUNT_MISMATCH", {
    ...expectedMetadata(),
    artifactCount: 5,
  });
});

test("relay builds the official account_put_transaction parameter envelope", () => {
  const signedTransaction = signedAnchorTransaction();
  const request = buildAccountPutTransactionRequest({
    id: 1,
    signedTransactionV1: signedTransaction,
  });

  assert.deepEqual(request, {
    jsonrpc: "2.0",
    id: 1,
    method: "account_put_transaction",
    params: [
      {
        name: "transaction",
        value: {
          Version1: signedTransaction,
        },
      },
    ],
  });
  assert.deepEqual(getAccountPutTransactionEnvelopeDiagnostic(request), {
    rpcMethodUsed: "account_put_transaction",
    paramsContainerShape: "array",
    transactionWrapperShape: "Version1",
    outgoingRequestSchemaValid: true,
  });
  assert.doesNotThrow(() => assertAccountPutTransactionEnvelope(request));
});

test("relay envelope validator rejects raw signed transactions and loose params objects", () => {
  const signedTransaction = signedAnchorTransaction();

  assert.throws(
    () => assertAccountPutTransactionEnvelope(signedTransaction),
    /Casper RPC transaction submission envelope is invalid/,
  );
  assert.deepEqual(
    getAccountPutTransactionEnvelopeDiagnostic({
      jsonrpc: "2.0",
      method: "account_put_transaction",
      params: {
        transaction: {
          Version1: signedTransaction,
        },
      },
    }),
    {
      rpcMethodUsed: "account_put_transaction",
      paramsContainerShape: "object",
      transactionWrapperShape: "unknown",
      outgoingRequestSchemaValid: false,
    },
  );
});

test("server relay posts the official signed TransactionV1 envelope and returns submitted only", async () => {
  const signedTransaction = signedAnchorTransaction();
  let relayedBody: unknown;
  globalThis.fetch = (async (_url, init) => {
    relayedBody = JSON.parse(String(init?.body));
    return Response.json({
      jsonrpc: "2.0",
      result: {
        transaction_hash: {
          Version1:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      },
    });
  }) as typeof fetch;

  const result = await relaySignedAnchorTransaction({
    signedTransaction,
    expected: expectedMetadata(),
  });

  assert.equal(result.status, "submitted");
  if (result.status === "submitted") {
    assert.equal(
      result.transactionHash,
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
  }
  assert.deepEqual(relayedBody, {
    jsonrpc: "2.0",
    id: (relayedBody as { id: number }).id,
    method: "account_put_transaction",
    params: [
      {
        name: "transaction",
        value: {
          Version1: signedTransaction,
        },
      },
    ],
  });
  assert.equal(
    getAccountPutTransactionEnvelopeDiagnostic(relayedBody)
      .outgoingRequestSchemaValid,
    true,
  );
});

test("original unsigned JSON cannot be accidentally relayed after signing", async () => {
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return Response.json({});
  }) as typeof fetch;

  const result = await relaySignedAnchorTransaction({
    signedTransaction: transactionJson().Version1,
    expected: expectedMetadata(),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.code, "NO_APPROVALS");
  assert.equal(fetchCalled, false);
});

test("server relay reports Casper RPC rejection without confirming the proof", async () => {
  globalThis.fetch = (async () =>
    Response.json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "transaction rejected",
      },
    })) as typeof fetch;

  const result = await relaySignedAnchorTransaction({
    signedTransaction: signedAnchorTransaction(),
    expected: expectedMetadata(),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.code, "CASPER_RPC_REJECTED");
  assert.equal(result.message, "transaction rejected");
  if (result.status === "failed") {
    assert.equal(result.diagnostic?.rpcMethodUsed, "account_put_transaction");
    assert.equal(result.diagnostic?.paramsContainerShape, "array");
    assert.equal(result.diagnostic?.transactionWrapperShape, "Version1");
    assert.equal(result.diagnostic?.outgoingRequestSchemaValid, true);
  }
});

test("anchor submission uses the relay and no direct browser RPC write remains", () => {
  const componentSource = fs.readFileSync(
    "components/dossier-anchor-action.tsx",
    "utf8",
  );
  const relaySource = fs.readFileSync("lib/casper/submit-anchor-relay.ts", "utf8");
  const routeSource = fs.readFileSync(
    "app/api/casper/submit-anchor/route.ts",
    "utf8",
  );
  const serverSubmissionSource = `${relaySource}\n${routeSource}`;

  assert.equal(componentSource.includes("/api/casper/submit-anchor"), true);
  assert.equal(componentSource.includes("submitSignedAnchorTransaction"), false);
  assert.equal(componentSource.includes("checkCasperTestnetRpcBrowserReadiness"), false);
  assert.equal(serverSubmissionSource.includes("account_put_transaction"), true);
  assert.equal(serverSubmissionSource.includes("RpcClient"), false);
  assert.equal(serverSubmissionSource.includes("putTransaction("), false);
  assert.equal(serverSubmissionSource.includes("PrivateKey"), false);
  assert.equal(serverSubmissionSource.includes("rawSign"), false);
  assert.equal(serverSubmissionSource.includes("setSignature"), false);
  assert.equal(serverSubmissionSource.includes("ContractCallBuilder"), false);
  assert.equal(serverSubmissionSource.includes("secret_key"), false);
  assert.equal(serverSubmissionSource.includes("console.log"), false);
  assert.equal(componentSource.includes("console.log"), false);
});

test("internal signature harness cannot relay, submit, or call Casper RPC", () => {
  const harnessSource = fs.readFileSync(
    "components/casper-signature-harness.tsx",
    "utf8",
  );
  const harnessRouteSource = fs.readFileSync(
    "app/internal/casper-signature-harness/page.tsx",
    "utf8",
  );
  const combined = `${harnessSource}\n${harnessRouteSource}`;

  assert.equal(combined.includes("/api/casper/submit-anchor"), false);
  assert.equal(combined.includes("relaySignedAnchorTransaction"), false);
  assert.equal(combined.includes("account_put_transaction"), false);
  assert.equal(combined.includes("fetch("), false);
  assert.equal(combined.includes("CASPER_TESTNET_RPC"), false);
  assert.equal(combined.includes("NO TRANSACTION SUBMITTED"), true);
  assert.equal(combined.includes("process.env.NODE_ENV === \"production\""), true);
});

test("production wallet adapter and harness use wrapper instance signature attachment", () => {
  const liveProofSource = fs.readFileSync(
    "lib/casper/live-proof-transaction.ts",
    "utf8",
  );
  const harnessSource = fs.readFileSync(
    "components/casper-signature-harness.tsx",
    "utf8",
  );
  const productionAttachmentSource = `${liveProofSource}\n${harnessSource}`;

  assert.equal(
    productionAttachmentSource.includes("TransactionV1.setSignature"),
    false,
  );
  assert.equal(
    productionAttachmentSource.includes("fromTransactionV1"),
    false,
  );
  assert.equal(liveProofSource.includes("transaction.setSignature"), true);
  assert.equal(harnessSource.includes("signatureAttachmentMethod"), true);
  assert.equal(harnessSource.includes("Transaction#setSignature"), true);
});

test("internal signature harness exposes only safe attachment metadata", () => {
  const harnessSource = fs.readFileSync(
    "components/casper-signature-harness.tsx",
    "utf8",
  );

  assert.equal(harnessSource.includes("walletResponseReceived"), true);
  assert.equal(harnessSource.includes("signatureRuntimeCategory"), true);
  assert.equal(harnessSource.includes("primaryNormalization"), true);
  assert.equal(harnessSource.includes("hexFallbackNormalization"), true);
  assert.equal(harnessSource.includes("selectedSource"), true);
  assert.equal(harnessSource.includes("normalizedByteLength"), true);
  assert.equal(
    harnessSource.includes("attachmentCompletedWithoutException"),
    true,
  );
  assert.equal(harnessSource.includes("SIGNATURE_ATTACHMENT_EXCEPTION"), true);
  assert.equal(harnessSource.includes("approvalCount"), true);
  assert.equal(harnessSource.includes("approvalCountValid"), true);
  assert.equal(harnessSource.includes("signerPresent"), true);
  assert.equal(harnessSource.includes("signaturePresent"), true);
  assert.equal(harnessSource.includes("approvalSignerMatchesInitiator"), true);
  assert.equal(
    harnessSource.includes("approvalSignerMatchesConnectedWallet"),
    true,
  );
  assert.equal(harnessSource.includes("payloadUnchanged"), true);
  assert.equal(harnessSource.includes("finalStructuralValidity"), true);
  assert.equal(harnessSource.includes("sdkReturnConstructor"), false);
  assert.equal(harnessSource.includes("JSON.stringify(response"), false);
  assert.equal(harnessSource.includes("walletTransactionJsonString}</dd>"), false);
});
