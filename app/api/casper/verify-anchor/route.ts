import { NextResponse } from "next/server";
import { verifyAnchorReadOnly } from "@/lib/casper/verify-anchor";

export const runtime = "nodejs";

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const artifactCount = Number(body.expectedArtifactCount);
    if (
      !isString(body.transactionHash) ||
      !isString(body.expectedJobId) ||
      !isString(body.expectedDossierHash) ||
      !isString(body.expectedArtifactRootHash) ||
      !Number.isInteger(artifactCount) ||
      artifactCount < 1 ||
      !isString(body.expectedPackageHash)
    ) {
      return NextResponse.json(
        {
          status: "failed",
          code: "INVALID_VERIFY_REQUEST",
          message: "Verification request is missing public anchor evidence.",
        },
        { status: 400 },
      );
    }
    const result = await verifyAnchorReadOnly({
      transactionHash: body.transactionHash,
      expectedJobId: body.expectedJobId,
      expectedDossierHash: body.expectedDossierHash,
      expectedArtifactRootHash: body.expectedArtifactRootHash,
      expectedArtifactCount: artifactCount,
      expectedPackageHash: body.expectedPackageHash,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        status: "unverified",
        code: "CASPER_READBACK_UNAVAILABLE",
        message: "UNVERIFIED — CHECK AGAIN",
      },
      { status: 503 },
    );
  }
}
