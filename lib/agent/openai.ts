import "server-only";

import OpenAI from "openai";
import {
  ContentFilterFinishReasonError,
  LengthFinishReasonError,
} from "openai/error";
import { getOpenAIAvailability } from "@/lib/agent/config";
import {
  classifyOpenAIError,
  LeadAgentProviderError,
  type OpenAIErrorMetadata,
  type SchemaFailureCategory,
} from "@/lib/agent/errors";
import {
  LeadAgentPlanSchema,
  type LeadAgentPlan,
  type LeadAgentRequest,
} from "@/lib/agent/schema";
import { requestLeadAgentResponse } from "@/lib/agent/responses";

export { LeadAgentProviderError } from "@/lib/agent/errors";

function providerMetadata(
  model: string | undefined,
  schemaFailure?: SchemaFailureCategory,
) {
  return {
    model: model ?? null,
    apiKeyPresent: Boolean(process.env.OPENAI_API_KEY?.trim()),
    modelEnvironmentPresent: Boolean(process.env.OPENAI_MODEL?.trim()),
    schemaFailure,
  };
}

function sanitizedApiMetadata(error: unknown): OpenAIErrorMetadata {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return { type: "api_connection_timeout_error" };
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return { type: "api_connection_error" };
  }
  if (error instanceof LengthFinishReasonError) {
    return { type: "length_finish_reason_error" };
  }
  if (error instanceof ContentFilterFinishReasonError) {
    return { type: "content_filter_finish_reason_error" };
  }
  if (!(error instanceof OpenAI.APIError)) return {};
  return {
    status: error.status,
    type: error.type,
    code: error.code,
  };
}

function logSafeProviderDiagnostic(error: LeadAgentProviderError) {
  if (process.env.NODE_ENV === "production") return;
  console.error("[uzoma-lead-agent] provider failure", {
    category: error.category,
    httpStatus: error.metadata.status ?? null,
    providerType: error.metadata.type ?? null,
    providerCode: error.metadata.code ?? null,
    model: error.metadata.model,
    apiKeyPresent: error.metadata.apiKeyPresent,
    modelEnvironmentPresent: error.metadata.modelEnvironmentPresent,
    schemaFailure: error.metadata.schemaFailure ?? null,
  });
}

export async function generateLiveLeadAgentPlan(
  input: LeadAgentRequest,
): Promise<LeadAgentPlan> {
  const availability = getOpenAIAvailability({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!availability.configured || !apiKey || !availability.model) {
    const failure = new LeadAgentProviderError(
      "OPENAI_NOT_CONFIGURED",
      providerMetadata(availability.model),
    );
    logSafeProviderDiagnostic(failure);
    throw failure;
  }

  const client = new OpenAI({ apiKey });
  try {
    const response = await requestLeadAgentResponse(
      (request) => client.responses.parse(request),
      availability.model,
      input,
    );

    if (!response.output_parsed) {
      throw new LeadAgentProviderError(
        "OPENAI_STRUCTURED_OUTPUT_INVALID",
        providerMetadata(availability.model, "missing_parsed_output"),
      );
    }
    return LeadAgentPlanSchema.parse(response.output_parsed);
  } catch (error) {
    let failure: LeadAgentProviderError;
    if (error instanceof LeadAgentProviderError) {
      failure = error;
    } else if (error instanceof Error && error.name === "ZodError") {
      failure = new LeadAgentProviderError(
        "OPENAI_STRUCTURED_OUTPUT_INVALID",
        providerMetadata(availability.model, "schema_validation_failed"),
      );
    } else {
      const apiMetadata = sanitizedApiMetadata(error);
      failure = new LeadAgentProviderError(classifyOpenAIError(apiMetadata), {
        ...providerMetadata(availability.model),
        ...apiMetadata,
      });
    }
    logSafeProviderDiagnostic(failure);
    throw failure;
  }
}
