import { NextRequest, NextResponse } from "next/server";
import {
  LeadAgentProviderError,
  leadAgentErrorResponses,
} from "@/lib/agent/errors";
import {
  LeadAgentRequestSchema,
  type LeadAgentPlan,
  type LeadAgentRequest,
} from "@/lib/agent/schema";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

type GeneratePlan = (input: LeadAgentRequest) => Promise<LeadAgentPlan>;

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message }, fallbackAvailable: true },
    { status },
  );
}

export function createLeadAgentPostHandler(generatePlan: GeneratePlan) {
  const requestsByClient = new Map<string, number[]>();

  return async function post(request: NextRequest) {
    const key =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const now = Date.now();
    const recent = (requestsByClient.get(key) ?? []).filter(
      (timestamp) => now - timestamp < WINDOW_MS,
    );
    if (recent.length >= MAX_REQUESTS) {
      requestsByClient.set(key, recent);
      return errorResponse(
        "rate_limited",
        "Too many planning requests. Wait a minute, then try again.",
        429,
      );
    }
    requestsByClient.set(key, [...recent, now]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("invalid_json", "Submit a valid JSON request.", 400);
    }

    const parsed = LeadAgentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "invalid_request",
        "Check the title, description, and delivery context limits.",
        400,
      );
    }

    try {
      const plan = await generatePlan(parsed.data);
      return NextResponse.json({ agentMode: "live", plan });
    } catch (error) {
      if (error instanceof LeadAgentProviderError) {
        const mapped = leadAgentErrorResponses[error.category];
        return errorResponse(error.category, mapped.message, mapped.status);
      }
      return errorResponse(
        "OPENAI_UNKNOWN_PROVIDER_ERROR",
        leadAgentErrorResponses.OPENAI_UNKNOWN_PROVIDER_ERROR.message,
        502,
      );
    }
  };
}
