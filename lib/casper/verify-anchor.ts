import { LIVE_PROOF_ANCHOR_CONFIG } from "@/lib/casper/live-proof-transaction";
import {
  getCsprLiveDeployUrl,
  type AnchorVerificationInput,
  type AnchorVerificationResponse,
} from "@/lib/casper/live-proof";
import type { BrowserCasperAnchorProof } from "@/lib/types";

const DEFAULT_RPC = "https://node.testnet.casper.network/rpc";
const EVENT_SEARCH_LIMIT = 64;

type RpcResponse = {
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringAt(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;
  for (const part of path) current = asRecord(current)?.[part];
  return typeof current === "string" ? current : undefined;
}

function numberAt(value: unknown, path: string[]): number | undefined {
  let current: unknown = value;
  for (const part of path) current = asRecord(current)?.[part];
  return typeof current === "number" ? current : undefined;
}

function isSuccessfulExecution(result: Record<string, unknown>) {
  const execution = asRecord(
    asRecord(result.execution_info)?.execution_result,
  );
  if (!execution) return false;
  if (asRecord(asRecord(execution.Version1)?.Success)) return true;
  const version2 = asRecord(execution.Version2);
  return Boolean(version2 && !version2.error_message);
}

function isFailedExecution(result: Record<string, unknown>) {
  const execution = asRecord(
    asRecord(result.execution_info)?.execution_result,
  );
  if (!execution) return false;
  return Boolean(
    asRecord(asRecord(execution.Version1)?.Failure) ||
      asRecord(execution.Version2)?.error_message,
  );
}

function blockHashFromTransaction(result: Record<string, unknown>) {
  return (
    stringAt(result, ["execution_info", "block_hash"]) ||
    stringAt(result, ["block_hash"])
  );
}

function blockHeightFromTransaction(result: Record<string, unknown>) {
  return (
    numberAt(result, ["execution_info", "block_height"]) ||
    numberAt(result, ["block_height"])
  );
}

async function rpc<T extends Record<string, unknown>>(
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(process.env.CASPER_TESTNET_RPC || DEFAULT_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
    cache: "no-store",
  });
  const json = (await response.json()) as RpcResponse;
  if (json.error) {
    throw new Error(json.error.message || `${method} failed`);
  }
  if (!json.result) throw new Error(`${method} returned no result`);
  return json.result as T;
}

function normalizeHash(value: string) {
  return value.replace(/^(contract-package-|contract-|hash-)/, "hash-");
}

async function resolveContractHash(packageHash: string) {
  const state = await rpc("query_global_state", {
    key: packageHash,
    path: [],
  });
  const versions = asRecord(asRecord(state.stored_value)?.ContractPackage)
    ?.versions;
  const current = Array.isArray(versions) ? asRecord(versions.at(-1)) : undefined;
  const contractHash =
    typeof current?.contract_hash === "string"
      ? normalizeHash(current.contract_hash)
      : undefined;
  if (!contractHash) throw new Error("Registry contract hash not found");
  return contractHash;
}

async function getStateRootHash(blockHash?: string, blockHeight?: number) {
  const block_identifier = blockHash
    ? { Hash: blockHash }
    : typeof blockHeight === "number"
      ? { Height: blockHeight }
      : undefined;
  const result = await rpc("chain_get_state_root_hash", {
    ...(block_identifier ? { block_identifier } : {}),
  });
  const stateRootHash = stringAt(result, ["state_root_hash"]);
  if (!stateRootHash) throw new Error("State root hash not found");
  return stateRootHash;
}

function readU8(bytes: Uint8Array, offset: { value: number }) {
  return bytes[offset.value++];
}

function take(bytes: Uint8Array, offset: { value: number }, length: number) {
  const value = bytes.slice(offset.value, offset.value + length);
  offset.value += length;
  return value;
}

function readU32(bytes: Uint8Array, offset: { value: number }) {
  const view = new DataView(take(bytes, offset, 4).buffer);
  return view.getUint32(0, true);
}

function readU64(bytes: Uint8Array, offset: { value: number }) {
  const view = new DataView(take(bytes, offset, 8).buffer);
  const value = view.getBigUint64(0, true);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined;
}

function readString(bytes: Uint8Array, offset: { value: number }) {
  return new TextDecoder().decode(take(bytes, offset, readU32(bytes, offset)));
}

function decodeDossierAnchoredEvent(parsed: unknown) {
  if (!Array.isArray(parsed)) return undefined;
  const bytes = Uint8Array.from(parsed.filter((item) => typeof item === "number"));
  const offset = { value: 0 };
  const eventName = readString(bytes, offset);
  const id = readU64(bytes, offset);
  const creatorKeyTag = readU8(bytes, offset);
  const creator =
    creatorKeyTag === 0
      ? `account-hash-${Buffer.from(take(bytes, offset, 32)).toString("hex")}`
      : undefined;
  const record = {
    id,
    creator,
    jobId: readString(bytes, offset),
    dossierHash: readString(bytes, offset),
    artifactRootHash: readString(bytes, offset),
    artifactCount: readU32(bytes, offset),
    accepted: readU8(bytes, offset) === 1,
    recordedAt: readU64(bytes, offset),
  };
  if (eventName !== "event_DossierAnchored" || typeof id !== "number") {
    return undefined;
  }
  return { ...record, id };
}

async function readMatchingEvent({
  stateRootHash,
  contractHash,
  expected,
}: {
  stateRootHash: string;
  contractHash: string;
  expected: AnchorVerificationInput;
}) {
  for (let index = 0; index < EVENT_SEARCH_LIMIT; index += 1) {
    try {
      const event = await rpc("state_get_dictionary_item", {
        state_root_hash: stateRootHash,
        dictionary_identifier: {
          ContractNamedKey: {
            key: contractHash,
            dictionary_name: "__events",
            dictionary_item_key: String(index),
          },
        },
      });
      const parsed = asRecord(asRecord(event.stored_value)?.CLValue)?.parsed;
      const record = decodeDossierAnchoredEvent(parsed);
      if (
        record &&
        record.jobId === expected.expectedJobId &&
        record.dossierHash === expected.expectedDossierHash &&
        record.artifactRootHash === expected.expectedArtifactRootHash &&
        record.artifactCount === expected.expectedArtifactCount &&
        record.accepted === true
      ) {
        return {
          index,
          dictionaryKey: stringAt(event, ["dictionary_key"]),
          record,
        };
      }
    } catch {
      // Dictionary event indexes are contiguous, but a public RPC may return
      // transient misses while the block is still propagating. Keep the search
      // bounded and return unverified if no exact event is found.
    }
  }
  return undefined;
}

export async function verifyAnchorReadOnly(
  input: AnchorVerificationInput,
): Promise<AnchorVerificationResponse> {
  if (input.expectedPackageHash !== LIVE_PROOF_ANCHOR_CONFIG.packageHash) {
    return {
      status: "failed",
      code: "PACKAGE_HASH_MISMATCH",
      message: "The package hash does not match the Uzoma Testnet registry.",
    };
  }
  const tx = await rpc("info_get_transaction", {
    transaction_hash: { Version1: input.transactionHash },
  });
  if (isFailedExecution(tx)) {
    return {
      status: "failed",
      code: "TRANSACTION_EXECUTION_FAILED",
      message: "The transaction executed with a Casper failure result.",
      transactionHash: input.transactionHash,
    };
  }
  if (!isSuccessfulExecution(tx)) {
    return {
      status: "unverified",
      code: "TRANSACTION_NOT_EXECUTED",
      message: "UNVERIFIED — CHECK AGAIN",
      transactionHash: input.transactionHash,
    };
  }
  const blockHash = blockHashFromTransaction(tx);
  const blockHeight = blockHeightFromTransaction(tx);
  const contractHash = await resolveContractHash(input.expectedPackageHash);
  const stateRootHash = await getStateRootHash(blockHash, blockHeight);
  const event = await readMatchingEvent({
    stateRootHash,
    contractHash,
    expected: input,
  });
  if (!event) {
    return {
      status: "unverified",
      code: "ANCHOR_EVENT_NOT_MATCHED",
      message: "UNVERIFIED — CHECK AGAIN",
      transactionHash: input.transactionHash,
    };
  }
  const verifiedAt = new Date().toISOString();
  const recordedAt =
    typeof event.record.recordedAt === "number"
      ? new Date(event.record.recordedAt).toISOString()
      : undefined;
  const proof: BrowserCasperAnchorProof = {
    schema: "uzoma.browser-casper-anchor.v1",
    status: "confirmed",
    network: "Casper Testnet",
    chainName: LIVE_PROOF_ANCHOR_CONFIG.chainName,
    packageHash: input.expectedPackageHash,
    contractHash,
    anchorTransactionHash: input.transactionHash,
    csprLiveUrl: getCsprLiveDeployUrl(input.transactionHash),
    block: {
      hash: blockHash,
      height: blockHeight,
      stateRootHash,
    },
    event: {
      dictionary: "__events",
      index: event.index,
      dictionaryKey: event.dictionaryKey,
      name: "DossierAnchored",
    },
    onChainRecord: {
      id: event.record.id,
      creator: event.record.creator,
      jobId: event.record.jobId,
      dossierHash: event.record.dossierHash,
      artifactRootHash: event.record.artifactRootHash,
      artifactCount: event.record.artifactCount,
      accepted: true,
      recordedAt: event.record.recordedAt,
      recordedAtIso: recordedAt,
    },
    verifiedAt,
    browserLocal: true,
  };
  return { status: "confirmed", proof };
}
