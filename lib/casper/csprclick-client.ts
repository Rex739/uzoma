"use client";

import type { CSPRClickSDK } from "@make-software/csprclick-core-client/sdk";
import type { AccountType } from "@make-software/csprclick-core-types";
import { ProviderInfoSupports } from "@make-software/csprclick-core-types/wallets";
import { LIVE_PROOF_ANCHOR_CONFIG } from "@/lib/casper/live-proof-transaction";

const APP_NAME = "Uzoma";
const CASPER_WALLET_PROVIDER = "casper-wallet";
const SIGN_TRANSACTION_V1_SUPPORT = ProviderInfoSupports.SignTransactionV1;

declare global {
  interface Window {
    csprclick?: CSPRClickSDK;
  }
}

export type CsprClickWalletClient = {
  sdk: CSPRClickSDK;
  providerKey: typeof CASPER_WALLET_PROVIDER;
  requiredSupport: typeof SIGN_TRANSACTION_V1_SUPPORT;
};

export type WalletConnectionResult = {
  account: AccountType;
  publicKey: string;
  supportsTransactionV1: boolean;
};

export type CsprClickRuntimeDiagnostics = {
  configured: boolean;
  appIdPresent: boolean;
  browserRuntime: boolean;
  globalClientPresent: boolean;
  providerKey: typeof CASPER_WALLET_PROVIDER;
  requiredSupport: typeof SIGN_TRANSACTION_V1_SUPPORT;
  chainName: typeof LIVE_PROOF_ANCHOR_CONFIG.chainName;
  rpc: string;
};

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

export function getCsprClickRuntimeDiagnostics(): CsprClickRuntimeDiagnostics {
  const config = getCsprClickConfig();
  const browserRuntime = typeof window !== "undefined";
  return {
    configured: Boolean(config.appId),
    appIdPresent: Boolean(config.appId),
    browserRuntime,
    globalClientPresent: browserRuntime ? Boolean(window.csprclick) : false,
    providerKey: CASPER_WALLET_PROVIDER,
    requiredSupport: SIGN_TRANSACTION_V1_SUPPORT,
    chainName: LIVE_PROOF_ANCHOR_CONFIG.chainName,
    rpc: config.rpc,
  };
}

export async function createCsprClickWalletClient(): Promise<CsprClickWalletClient> {
  if (typeof window === "undefined") {
    throw new Error("Wallet integration is only available in the browser.");
  }
  const configIssue = getCsprClickConfigIssue();
  if (configIssue) throw new Error(configIssue);

  const sdk = window.csprclick;
  if (!sdk) {
    throw new Error(
      "CSPR.click wallet client is unavailable in this browser session.",
    );
  }
  sdk.init({
    appName: APP_NAME,
    appId: getCsprClickConfig().appId,
    contentMode: "popup",
    providers: [CASPER_WALLET_PROVIDER],
    chainName: LIVE_PROOF_ANCHOR_CONFIG.chainName,
    casperNode: getCsprClickConfig().rpc,
    logLevel: 1,
  });
  return {
    sdk,
    providerKey: CASPER_WALLET_PROVIDER,
    requiredSupport: SIGN_TRANSACTION_V1_SUPPORT,
  };
}

export function supportsTransactionV1(account: AccountType | null | undefined) {
  return Boolean(
    account?.providerSupports?.some(
      (support) => support.toLowerCase() === SIGN_TRANSACTION_V1_SUPPORT,
    ),
  );
}

export async function connectCasperWallet(
  client: CsprClickWalletClient,
): Promise<WalletConnectionResult> {
  const account = await client.sdk.connect(client.providerKey);
  if (!account?.public_key) {
    throw new Error("No Casper account was returned by the wallet.");
  }
  return {
    account,
    publicKey: account.public_key,
    supportsTransactionV1: supportsTransactionV1(account),
  };
}
