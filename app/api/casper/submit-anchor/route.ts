import { NextResponse } from "next/server";
import { relaySignedAnchorTransaction } from "@/lib/casper/submit-anchor-relay";
import {
  getSignedTransactionBoundaryDiagnostic,
  type SignedTransactionBoundaryDiagnostic,
} from "@/lib/casper/signed-transaction-diagnostics";

export const runtime = "nodejs";

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const expected = body.expected as Record<string, unknown> | undefined;
    const artifactCount = Number(expected?.artifactCount);
    const clientDiagnostic =
      body.clientDiagnostic &&
      typeof body.clientDiagnostic === "object" &&
      "approvalCount" in body.clientDiagnostic
        ? (body.clientDiagnostic as SignedTransactionBoundaryDiagnostic)
        : undefined;

    if (
      !body.signedTransaction ||
      !expected ||
      !isString(expected.jobId) ||
      !isString(expected.dossierHash) ||
      !isString(expected.artifactRootHash) ||
      !Number.isInteger(artifactCount) ||
      artifactCount < 1 ||
      !isString(expected.expectedPackageHash) ||
      !isString(expected.expectedNetwork)
    ) {
      return NextResponse.json(
        {
          status: "failed",
          code: "INVALID_RELAY_REQUEST",
          message: "Relay request is missing public signed anchor evidence.",
        },
        { status: 400 },
      );
    }

    const result = await relaySignedAnchorTransaction({
      signedTransaction: body.signedTransaction,
      expected: {
        jobId: expected.jobId,
        dossierHash: expected.dossierHash,
        artifactRootHash: expected.artifactRootHash,
        artifactCount,
        expectedPackageHash: expected.expectedPackageHash,
        expectedNetwork: expected.expectedNetwork,
      },
      clientDiagnostic,
    });
    if (
      process.env.NODE_ENV !== "production" &&
      result.status === "failed" &&
      result.code === "MISSING_APPROVAL"
    ) {
      const serverDiagnostic = getSignedTransactionBoundaryDiagnostic(
        body.signedTransaction,
      );
      return NextResponse.json(
        {
          ...result,
          diagnostic: {
            clientExpectedApprovalCount: clientDiagnostic?.approvalCount,
            serverObservedApprovalCount: serverDiagnostic.approvalCount,
            approvalContainerPath: serverDiagnostic.approvalContainerPath,
            transactionVariant: serverDiagnostic.transactionVariant,
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json(result, {
      status: result.status === "submitted" ? 202 : 400,
    });
  } catch {
    return NextResponse.json(
      {
        status: "failed",
        code: "CASPER_RELAY_UNAVAILABLE",
        message: "Signed transaction could not be relayed.",
      },
      { status: 503 },
    );
  }
}
