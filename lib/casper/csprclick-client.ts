"use client";

import type {
  AccountType,
  ICSPRClickSDK,
} from "@make-software/csprclick-core-types";
import {
  ProviderInfoSupports,
  WALLET_KEYS,
} from "@make-software/csprclick-core-types/wallets";
import { LIVE_PROOF_ANCHOR_CONFIG } from "@/lib/casper/live-proof-transaction";

const CASPER_WALLET_PROVIDER = WALLET_KEYS.CASPER_WALLET;
const SIGN_TRANSACTION_V1_SUPPORT = ProviderInfoSupports.SignTransactionV1;

export const CSPRCLICK_RUNTIME_VERSION = "2.1" as const;
export const CSPRCLICK_RUNTIME_LOADER_STRATEGY =
  "blocked-no-official-immutable-runtime-url" as const;

const REQUIRED_RUNTIME_METHODS = [
  "init",
  "isProviderPresent",
  "getProviderInfo",
  "connect",
  "send",
] as const;

type RequiredRuntimeMethod = (typeof REQUIRED_RUNTIME_METHODS)[number];

declare global {
  interface Window {
    csprclick?: unknown;
  }
}

export type CsprClickRuntimeApiCheck = {
  compatible: boolean;
  missingMethods: RequiredRuntimeMethod[];
  methods: Record<RequiredRuntimeMethod, boolean>;
};

export type CsprClickProviderAvailability =
  | "available"
  | "unavailable"
  | "unknown";

export type CsprClickRuntimeDiagnostics = {
  configured: boolean;
  appIdPresent: boolean;
  browserRuntime: boolean;
  globalClientPresent: boolean;
  runtimeVersion: typeof CSPRCLICK_RUNTIME_VERSION;
  loaderStrategy: typeof CSPRCLICK_RUNTIME_LOADER_STRATEGY;
  officialImmutableLoaderVerified: false;
  providerKey: typeof CASPER_WALLET_PROVIDER;
  requiredSupport: typeof SIGN_TRANSACTION_V1_SUPPORT;
  chainName: typeof LIVE_PROOF_ANCHOR_CONFIG.chainName;
  rpc: string;
  apiCheck: CsprClickRuntimeApiCheck;
  providerAvailability: CsprClickProviderAvailability;
  transactionV1Capability: "not-tested" | "supported" | "unsupported" | "unknown";
};

export type CsprClickRuntimeStatus =
  | "app-id-missing"
  | "browser-unavailable"
  | "runtime-loader-blocked"
  | "runtime-unloaded"
  | "runtime-api-unsupported"
  | "runtime-api-compatible"
  | "provider-unavailable"
  | "transactionv1-unknown";

export function getCsprClickConfig() {
  return {
    appId: process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID?.trim() ?? "",
    rpc:
      process.env.NEXT_PUBLIC_CASPER_TESTNET_RPC?.trim() ??
      "https://node.testnet.casper.network/rpc",
    chainName: LIVE_PROOF_ANCHOR_CONFIG.chainName,
  };
}

export function getCsprClickConfigIssue() {
  const config = getCsprClickConfig();
  if (!config.appId) {
    return "CSPR.click app ID is not configured.";
  }
  return undefined;
}

function getBrowserWindow(): Window | undefined {
  return typeof window === "undefined" ? undefined : window;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function checkCsprClickRuntimeApi(
  runtime: unknown,
): CsprClickRuntimeApiCheck {
  const methods = REQUIRED_RUNTIME_METHODS.reduce(
    (result, method) => ({
      ...result,
      [method]: isObject(runtime) && typeof runtime[method] === "function",
    }),
    {} as Record<RequiredRuntimeMethod, boolean>,
  );
  const missingMethods = REQUIRED_RUNTIME_METHODS.filter(
    (method) => !methods[method],
  );
  return {
    compatible: missingMethods.length === 0,
    missingMethods,
    methods,
  };
}

export function getLoadedCsprClickRuntime(): ICSPRClickSDK | undefined {
  const runtime = getBrowserWindow()?.csprclick;
  const apiCheck = checkCsprClickRuntimeApi(runtime);
  return apiCheck.compatible ? (runtime as ICSPRClickSDK) : undefined;
}

export function inspectProviderAvailability(
  sdk: ICSPRClickSDK | undefined,
): CsprClickProviderAvailability {
  if (!sdk) return "unknown";
  try {
    return sdk.isProviderPresent(CASPER_WALLET_PROVIDER)
      ? "available"
      : "unavailable";
  } catch {
    return "unknown";
  }
}

export async function inspectTransactionV1Capability(
  sdk: ICSPRClickSDK | undefined,
) {
  if (!sdk) return "unknown" as const;
  try {
    const providerInfo = await sdk.getProviderInfo(CASPER_WALLET_PROVIDER);
    if (!providerInfo?.supports) return "unknown" as const;
    return providerInfo.supports.some(
      (support) =>
        support.toLowerCase() === SIGN_TRANSACTION_V1_SUPPORT.toLowerCase(),
    )
      ? ("supported" as const)
      : ("unsupported" as const);
  } catch {
    return "unknown" as const;
  }
}

export function getCsprClickRuntimeDiagnostics(): CsprClickRuntimeDiagnostics {
  const config = getCsprClickConfig();
  const browserWindow = getBrowserWindow();
  const runtime = browserWindow?.csprclick;
  const apiCheck = checkCsprClickRuntimeApi(runtime);
  const sdk = apiCheck.compatible ? (runtime as ICSPRClickSDK) : undefined;
  return {
    configured: Boolean(config.appId),
    appIdPresent: Boolean(config.appId),
    browserRuntime: Boolean(browserWindow),
    globalClientPresent: Boolean(runtime),
    runtimeVersion: CSPRCLICK_RUNTIME_VERSION,
    loaderStrategy: CSPRCLICK_RUNTIME_LOADER_STRATEGY,
    officialImmutableLoaderVerified: false,
    providerKey: CASPER_WALLET_PROVIDER,
    requiredSupport: SIGN_TRANSACTION_V1_SUPPORT,
    chainName: LIVE_PROOF_ANCHOR_CONFIG.chainName,
    rpc: config.rpc,
    apiCheck,
    providerAvailability: inspectProviderAvailability(sdk),
    transactionV1Capability: "not-tested",
  };
}

export function getCsprClickRuntimeStatus(): CsprClickRuntimeStatus {
  const configIssue = getCsprClickConfigIssue();
  if (configIssue) return "app-id-missing";
  const browserWindow = getBrowserWindow();
  if (!browserWindow) return "browser-unavailable";
  const runtime = browserWindow.csprclick;
  if (!runtime) return "runtime-loader-blocked";
  const apiCheck = checkCsprClickRuntimeApi(runtime);
  if (!apiCheck.compatible) return "runtime-api-unsupported";
  const sdk = runtime as ICSPRClickSDK;
  const providerAvailability = inspectProviderAvailability(sdk);
  if (providerAvailability === "unavailable") return "provider-unavailable";
  return "runtime-api-compatible";
}

export async function loadCsprClickRuntime(): Promise<ICSPRClickSDK> {
  const loadedRuntime = getLoadedCsprClickRuntime();
  if (loadedRuntime) return loadedRuntime;
  throw new Error(
    "CSPR.click runtime loading is disabled until an official immutable runtime URL is verified.",
  );
}

export function supportsTransactionV1(account: AccountType | null | undefined) {
  return Boolean(
    account?.providerSupports?.some(
      (support) =>
        support.toLowerCase() === SIGN_TRANSACTION_V1_SUPPORT.toLowerCase(),
    ),
  );
}
