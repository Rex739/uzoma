"use client";

export const CASPER_WALLET_TRANSACTION_V1_SUPPORT =
  "sign-transactionv1" as const;

export type CasperWalletSignatureResponse =
  | {
      cancelled: true;
      message?: string;
    }
  | {
      cancelled: false;
      signatureHex: string;
      signature: unknown;
    };

export type CasperWalletSignatureByteCategory =
  | "uint8array"
  | "typed-array-view"
  | "data-view"
  | "array-buffer"
  | "number-array"
  | "data-number-array"
  | "numeric-keyed-object"
  | "string"
  | "unknown";

export type CasperWalletSignatureByteDiagnostic = {
  category: CasperWalletSignatureByteCategory;
  byteLength: number;
  ok: boolean;
  failure?: string;
};

export type CasperWalletSignatureSelectionDiagnostic = {
  walletResponseReceived: boolean;
  cancelled: boolean;
  signatureFieldPresent: boolean;
  signatureRuntimeCategory:
    | "Uint8Array"
    | "ArrayBuffer"
    | "typed-array view"
    | "number array"
    | "numeric-keyed object"
    | "string"
    | "missing"
    | "unknown";
  primaryNormalization: "passed" | "failed" | "not used";
  signatureHexFieldPresent: boolean;
  hexFallbackNormalization: "passed" | "failed" | "not used";
  selectedSource: "signature" | "signatureHex" | "none";
  normalizedByteLength: number;
  failure?: "signature_mismatch" | "signature_normalization_failed";
};

export type NativeCasperWalletProvider = {
  requestConnection(): Promise<boolean>;
  isConnected(): Promise<boolean>;
  getActivePublicKey(): Promise<string>;
  getActivePublicKeySupports(): Promise<string[]>;
  getVersion?(): Promise<string>;
  sign(
    transactionJson: string,
    signingPublicKeyHex: string,
  ): Promise<CasperWalletSignatureResponse>;
};

export type CasperWalletConnection = {
  provider: NativeCasperWalletProvider;
  publicKey: string;
  supports: string[];
  version?: string;
};

export type CasperWalletErrorCode =
  | "CASPER_WALLET_NOT_INSTALLED"
  | "CASPER_WALLET_LOADING"
  | "CASPER_WALLET_LOCKED"
  | "CASPER_WALLET_CONNECTION_DECLINED"
  | "CASPER_WALLET_NO_ACTIVE_ACCOUNT"
  | "CASPER_WALLET_TRANSACTION_V1_UNSUPPORTED"
  | "CASPER_WALLET_PROVIDER_UNSUPPORTED"
  | "CASPER_WALLET_SIGNING_CANCELLED"
  | "CASPER_WALLET_SIGNING_ERROR";

export class CasperWalletClientError extends Error {
  constructor(
    public code: CasperWalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CasperWalletClientError";
  }
}

export function messageForWalletError(error: unknown) {
  if (error instanceof CasperWalletClientError) {
    const messages: Record<CasperWalletErrorCode, string> = {
      CASPER_WALLET_NOT_INSTALLED:
        "Casper Wallet is not installed or unavailable.",
      CASPER_WALLET_LOADING: "Casper Wallet is still loading.",
      CASPER_WALLET_LOCKED: "Unlock Casper Wallet and try again.",
      CASPER_WALLET_CONNECTION_DECLINED: "Wallet connection declined.",
      CASPER_WALLET_NO_ACTIVE_ACCOUNT:
        "No active Casper Wallet account was returned.",
      CASPER_WALLET_TRANSACTION_V1_UNSUPPORTED:
        "The active account does not advertise sign-transactionv1 support.",
      CASPER_WALLET_PROVIDER_UNSUPPORTED:
        "Casper Wallet provider API is unavailable or unsupported.",
      CASPER_WALLET_SIGNING_CANCELLED: "SIGNING CANCELLED",
      CASPER_WALLET_SIGNING_ERROR:
        "Wallet approval returned but could not be converted into a valid TransactionV1 approval. No transaction was submitted.",
    };
    return messages[error.code];
  }
  return error instanceof Error ? error.message : "Live anchor flow failed.";
}

declare global {
  interface Window {
    CasperWalletProvider?: () => unknown;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasMethod<T extends string>(
  value: unknown,
  method: T,
): value is Record<T, (...args: never[]) => unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)[method] === "function"
  );
}

export function isNativeCasperWalletProvider(
  value: unknown,
): value is NativeCasperWalletProvider {
  return (
    hasMethod(value, "requestConnection") &&
    hasMethod(value, "isConnected") &&
    hasMethod(value, "getActivePublicKey") &&
    hasMethod(value, "getActivePublicKeySupports") &&
    hasMethod(value, "sign")
  );
}

export function getNativeCasperWalletProvider():
  | NativeCasperWalletProvider
  | undefined {
  if (typeof window === "undefined") return undefined;
  if (typeof window.CasperWalletProvider !== "function") return undefined;
  try {
    const provider = window.CasperWalletProvider();
    return isNativeCasperWalletProvider(provider) ? provider : undefined;
  } catch {
    return undefined;
  }
}

export async function detectNativeCasperWalletProvider({
  timeoutMs = 1_600,
  intervalMs = 100,
}: {
  timeoutMs?: number;
  intervalMs?: number;
} = {}) {
  if (typeof window === "undefined") {
    throw new CasperWalletClientError(
      "CASPER_WALLET_PROVIDER_UNSUPPORTED",
      "Casper Wallet is only available in a browser.",
    );
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const provider = getNativeCasperWalletProvider();
    if (provider) return provider;
    await delay(intervalMs);
  }

  if (typeof window.CasperWalletProvider === "function") {
    throw new CasperWalletClientError(
      "CASPER_WALLET_PROVIDER_UNSUPPORTED",
      "Casper Wallet provider API is unavailable or unsupported.",
    );
  }

  throw new CasperWalletClientError(
    "CASPER_WALLET_NOT_INSTALLED",
    "Casper Wallet is not installed or is unavailable in this browser.",
  );
}

function classifyWalletError(error: unknown): CasperWalletClientError {
  if (error instanceof CasperWalletClientError) return error;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/lock/i.test(message)) {
    return new CasperWalletClientError("CASPER_WALLET_LOCKED", "Wallet locked.");
  }
  if (/declin|reject|denied|cancel/i.test(message)) {
    return new CasperWalletClientError(
      "CASPER_WALLET_CONNECTION_DECLINED",
      "Wallet connection declined.",
    );
  }
  if (/active account|active public key|not connected|site/i.test(message)) {
    return new CasperWalletClientError(
      "CASPER_WALLET_NO_ACTIVE_ACCOUNT",
      "No active Casper Wallet account is connected.",
    );
  }
  return new CasperWalletClientError(
    "CASPER_WALLET_PROVIDER_UNSUPPORTED",
    "Casper Wallet provider returned an unsupported response.",
  );
}

export function supportsTransactionV1(supports: string[] | undefined) {
  return Boolean(
    supports?.some(
      (support) =>
        support.toLowerCase() ===
        CASPER_WALLET_TRANSACTION_V1_SUPPORT.toLowerCase(),
    ),
  );
}

export async function connectNativeCasperWallet(): Promise<CasperWalletConnection> {
  const provider = await detectNativeCasperWalletProvider();
  let connected = false;
  try {
    connected = await provider.requestConnection();
  } catch (error) {
    throw classifyWalletError(error);
  }
  if (!connected) {
    throw new CasperWalletClientError(
      "CASPER_WALLET_CONNECTION_DECLINED",
      "Wallet connection declined.",
    );
  }

  try {
    const isConnected = await provider.isConnected();
    if (!isConnected) {
      throw new CasperWalletClientError(
        "CASPER_WALLET_CONNECTION_DECLINED",
        "Wallet connection was not accepted.",
      );
    }
    const publicKey = await provider.getActivePublicKey();
    if (!publicKey) {
      throw new CasperWalletClientError(
        "CASPER_WALLET_NO_ACTIVE_ACCOUNT",
        "No active Casper Wallet account is connected.",
      );
    }
    const supports = await provider.getActivePublicKeySupports();
    if (!supportsTransactionV1(supports)) {
      throw new CasperWalletClientError(
        "CASPER_WALLET_TRANSACTION_V1_UNSUPPORTED",
        "The active Casper Wallet account does not advertise TransactionV1 signing.",
      );
    }
    const version = provider.getVersion ? await provider.getVersion() : undefined;
    return { provider, publicKey, supports, version };
  } catch (error) {
    throw classifyWalletError(error);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function isValidByte(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}

function bytesFromNumberArray(value: unknown[]) {
  return value.every(isValidByte) ? Uint8Array.from(value as number[]) : null;
}

function bytesFromNumericKeyedObject(record: Record<string, unknown>) {
  const explicitLength = record.length;
  const keys =
    typeof explicitLength === "number" && Number.isInteger(explicitLength)
      ? Array.from({ length: explicitLength }, (_, index) => String(index))
      : Object.keys(record)
          .filter((key) => /^(0|[1-9][0-9]*)$/.test(key))
          .sort((left, right) => Number(left) - Number(right));
  if (keys.length === 0) return null;
  const values = keys.map((key) => record[key]);
  return bytesFromNumberArray(values);
}

function categorizeSignatureValue(
  value: unknown,
): CasperWalletSignatureByteCategory {
  if (value instanceof Uint8Array) return "uint8array";
  if (value instanceof ArrayBuffer) return "array-buffer";
  if (value instanceof DataView) return "data-view";
  if (ArrayBuffer.isView(value)) return "typed-array-view";
  if (Array.isArray(value)) return "number-array";
  if (typeof value === "string") return "string";
  const record = asRecord(value);
  if (Array.isArray(record?.data)) return "data-number-array";
  if (record && bytesFromNumericKeyedObject(record)) return "numeric-keyed-object";
  return "unknown";
}

function displayCategory(
  category: CasperWalletSignatureByteCategory,
): CasperWalletSignatureSelectionDiagnostic["signatureRuntimeCategory"] {
  const labels = {
    uint8array: "Uint8Array",
    "array-buffer": "ArrayBuffer",
    "typed-array-view": "typed-array view",
    "data-view": "typed-array view",
    "number-array": "number array",
    "data-number-array": "number array",
    "numeric-keyed-object": "numeric-keyed object",
    string: "string",
    unknown: "unknown",
  } satisfies Record<
    CasperWalletSignatureByteCategory,
    CasperWalletSignatureSelectionDiagnostic["signatureRuntimeCategory"]
  >;
  return labels[category];
}

export function getCasperWalletSignatureByteDiagnostic(
  value: unknown,
): CasperWalletSignatureByteDiagnostic {
  const category = categorizeSignatureValue(value);
  try {
    const bytes = normalizeCasperWalletSignatureBytes(value);
    return { category, byteLength: bytes.length, ok: true };
  } catch (error) {
    return {
      category,
      byteLength: 0,
      ok: false,
      failure: error instanceof Error ? error.message : "Invalid signature bytes.",
    };
  }
}

export function normalizeCasperWalletSignatureBytes(value: unknown): Uint8Array {
  let bytes: Uint8Array | null = null;
  if (value instanceof Uint8Array) {
    bytes = new Uint8Array(value);
  } else if (value instanceof ArrayBuffer) {
    bytes = new Uint8Array(value.slice(0));
  } else if (value instanceof DataView) {
    bytes = new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  } else if (ArrayBuffer.isView(value)) {
    bytes = new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  } else if (Array.isArray(value)) {
    bytes = bytesFromNumberArray(value);
  } else {
    const record = asRecord(value);
    if (record && Array.isArray(record.data)) {
      bytes = bytesFromNumberArray(record.data);
    } else if (record) {
      bytes = bytesFromNumericKeyedObject(record);
    }
  }

  if (!bytes || bytes.length === 0) {
    throw new CasperWalletClientError(
      "CASPER_WALLET_SIGNING_ERROR",
      "Casper Wallet returned malformed signature bytes.",
    );
  }
  if (![...bytes].every(isValidByte)) {
    throw new CasperWalletClientError(
      "CASPER_WALLET_SIGNING_ERROR",
      "Casper Wallet returned invalid signature byte values.",
    );
  }
  return new Uint8Array(bytes);
}

function decodeSignatureHex(value: unknown): Uint8Array {
  if (typeof value !== "string") {
    throw new CasperWalletClientError(
      "CASPER_WALLET_SIGNING_ERROR",
      "Casper Wallet returned malformed signature hex.",
    );
  }
  const normalized = value.replace(/^0x/i, "");
  if (
    normalized.length === 0 ||
    normalized.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(normalized)
  ) {
    throw new CasperWalletClientError(
      "CASPER_WALLET_SIGNING_ERROR",
      "Casper Wallet returned malformed signature hex.",
    );
  }
  const bytes = Uint8Array.from(
    normalized.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
  if (bytes.length === 0) {
    throw new CasperWalletClientError(
      "CASPER_WALLET_SIGNING_ERROR",
      "Casper Wallet returned empty signature hex.",
    );
  }
  return bytes;
}

function assertExpectedSignatureLength(bytes: Uint8Array) {
  if (bytes.length !== 64 && bytes.length !== 65) {
    throw new CasperWalletClientError(
      "CASPER_WALLET_SIGNING_ERROR",
      "Casper Wallet returned a malformed signature.",
    );
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  return (
    left.length === right.length &&
    left.every((byte, index) => byte === right[index])
  );
}

export function normalizeWalletSignatureWithDiagnostic(response: unknown) {
  const record = asRecord(response);
  const signatureCategory = record?.signature
    ? categorizeSignatureValue(record.signature)
    : undefined;
  const baseDiagnostic: CasperWalletSignatureSelectionDiagnostic = {
    walletResponseReceived: Boolean(record),
    cancelled: record?.cancelled === true,
    signatureFieldPresent:
      record !== undefined &&
      Object.prototype.hasOwnProperty.call(record, "signature"),
    signatureRuntimeCategory: signatureCategory
      ? displayCategory(signatureCategory)
      : "missing",
    primaryNormalization: "not used",
    signatureHexFieldPresent:
      record !== undefined &&
      Object.prototype.hasOwnProperty.call(record, "signatureHex"),
    hexFallbackNormalization: "not used",
    selectedSource: "none",
    normalizedByteLength: 0,
  };
  if (record?.cancelled === true) {
    throw new CasperWalletClientError(
      "CASPER_WALLET_SIGNING_CANCELLED",
      typeof record.message === "string"
        ? record.message
        : "Wallet signing cancelled.",
    );
  }

  let primaryBytes: Uint8Array | null = null;
  let hexBytes: Uint8Array | null = null;
  let primaryOk = false;
  let hexOk = false;

  try {
    primaryBytes = normalizeCasperWalletSignatureBytes(record?.signature);
    assertExpectedSignatureLength(primaryBytes);
    primaryOk = true;
  } catch {
    primaryBytes = null;
  }
  try {
    hexBytes = decodeSignatureHex(record?.signatureHex);
    assertExpectedSignatureLength(hexBytes);
    hexOk = true;
  } catch {
    hexBytes = null;
  }

  if (
    primaryOk &&
    hexOk &&
    primaryBytes &&
    hexBytes &&
    !bytesEqual(primaryBytes, hexBytes)
  ) {
    const diagnostic = {
      ...baseDiagnostic,
      primaryNormalization: "passed",
      hexFallbackNormalization: "passed",
      failure: "signature_mismatch",
    } satisfies CasperWalletSignatureSelectionDiagnostic;
    return { bytes: null, diagnostic };
  }

  const selected = primaryBytes ?? hexBytes;
  if (!selected) {
    const diagnostic = {
      ...baseDiagnostic,
      primaryNormalization: primaryOk ? "passed" : "failed",
      hexFallbackNormalization: hexOk ? "passed" : "failed",
      failure: "signature_normalization_failed",
    } satisfies CasperWalletSignatureSelectionDiagnostic;
    return { bytes: null, diagnostic };
  }

  const diagnostic = {
    ...baseDiagnostic,
    primaryNormalization: primaryOk ? "passed" : "failed",
    hexFallbackNormalization: primaryOk
      ? "not used"
      : hexOk
        ? "passed"
        : "failed",
    selectedSource: primaryBytes ? "signature" : "signatureHex",
    normalizedByteLength: selected.length,
  } satisfies CasperWalletSignatureSelectionDiagnostic;
  return { bytes: selected, diagnostic };
}

export function normalizeWalletSignature(response: unknown) {
  const { bytes, diagnostic } = normalizeWalletSignatureWithDiagnostic(response);
  if (!bytes) {
    if (diagnostic.failure === "signature_mismatch") {
      throw new CasperWalletClientError(
        "CASPER_WALLET_SIGNING_ERROR",
        "Casper Wallet returned conflicting signature representations.",
      );
    }
    throw new CasperWalletClientError(
      "CASPER_WALLET_SIGNING_ERROR",
      "Casper Wallet returned malformed signature bytes.",
    );
  }
  return bytes;
}

export async function requestNativeCasperWalletSignature({
  provider,
  transactionJson,
  signingPublicKeyHex,
}: {
  provider: NativeCasperWalletProvider;
  transactionJson: string;
  signingPublicKeyHex: string;
}) {
  try {
    const response = await provider.sign(transactionJson, signingPublicKeyHex);
    normalizeWalletSignature(response);
    return response;
  } catch (error) {
    if (
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_SIGNING_CANCELLED"
    ) {
      throw error;
    }
    const text = error instanceof Error ? error.message : String(error ?? "");
    if (/cancel|reject|declin/i.test(text)) {
      throw new CasperWalletClientError(
        "CASPER_WALLET_SIGNING_CANCELLED",
        "Wallet signing cancelled.",
      );
    }
    throw new CasperWalletClientError(
      "CASPER_WALLET_SIGNING_ERROR",
      "Casper Wallet signing failed.",
    );
  }
}

export async function signWithNativeCasperWallet({
  provider,
  transactionJson,
  signingPublicKeyHex,
}: {
  provider: NativeCasperWalletProvider;
  transactionJson: string;
  signingPublicKeyHex: string;
}) {
  return normalizeWalletSignature(
    await requestNativeCasperWalletSignature({
      provider,
      transactionJson,
      signingPublicKeyHex,
    }),
  );
}
