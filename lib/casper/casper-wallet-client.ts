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
      signature: Uint8Array | number[] | string;
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

function signatureCandidateToBytes(value: unknown): Uint8Array | undefined {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer as ArrayBuffer,
      value.byteOffset,
      value.byteLength,
    );
  }
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item))) {
    return Uint8Array.from(value);
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/^0x/, "");
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    return undefined;
  }
  return Uint8Array.from(
    normalized.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

export function normalizeWalletSignature(response: unknown) {
  const record = asRecord(response);
  if (record?.cancelled === true) {
    throw new CasperWalletClientError(
      "CASPER_WALLET_SIGNING_CANCELLED",
      typeof record.message === "string"
        ? record.message
        : "Wallet signing cancelled.",
    );
  }

  const signature = signatureCandidateToBytes(record?.signature);

  if (!signature || (signature.length !== 64 && signature.length !== 65)) {
    throw new CasperWalletClientError(
      "CASPER_WALLET_SIGNING_ERROR",
      "Casper Wallet returned a malformed signature.",
    );
  }
  return signature;
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
