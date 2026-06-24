export type LeadAgentFailureCategory =
  | "OPENAI_NOT_CONFIGURED"
  | "OPENAI_INVALID_API_KEY"
  | "OPENAI_INSUFFICIENT_QUOTA"
  | "OPENAI_MODEL_NOT_AVAILABLE"
  | "OPENAI_MODEL_NOT_SUPPORTED"
  | "OPENAI_RATE_LIMITED"
  | "OPENAI_STRUCTURED_OUTPUT_INVALID"
  | "OPENAI_PROVIDER_UNAVAILABLE"
  | "OPENAI_UNKNOWN_PROVIDER_ERROR";

export type SchemaFailureCategory =
  | "missing_parsed_output"
  | "schema_validation_failed";

export type OpenAIErrorMetadata = {
  status?: number;
  type?: string | null;
  code?: string | null;
};

const BILLING_CODES = new Set([
  "insufficient_quota",
  "billing_hard_limit_reached",
  "billing_not_active",
  "usage_limit_reached",
]);

const MODEL_UNAVAILABLE_CODES = new Set(["model_not_found", "invalid_model"]);

const MODEL_UNSUPPORTED_CODES = new Set([
  "unsupported_model",
  "model_not_supported",
]);

const PROVIDER_UNAVAILABLE_TYPES = new Set([
  "api_connection_error",
  "api_connection_timeout_error",
]);

const STRUCTURED_OUTPUT_TYPES = new Set([
  "schema_validation_failed",
  "missing_parsed_output",
  "length_finish_reason_error",
  "content_filter_finish_reason_error",
]);

export function classifyOpenAIError({
  status,
  type,
  code,
}: OpenAIErrorMetadata): LeadAgentFailureCategory {
  if (status === 401 || code === "invalid_api_key") {
    return "OPENAI_INVALID_API_KEY";
  }
  if (code && BILLING_CODES.has(code)) {
    return "OPENAI_INSUFFICIENT_QUOTA";
  }
  if (code && MODEL_UNAVAILABLE_CODES.has(code)) {
    return "OPENAI_MODEL_NOT_AVAILABLE";
  }
  if (code && MODEL_UNSUPPORTED_CODES.has(code)) {
    return "OPENAI_MODEL_NOT_SUPPORTED";
  }
  if (status === 404) return "OPENAI_MODEL_NOT_AVAILABLE";
  if (status === 429) return "OPENAI_RATE_LIMITED";
  if (type && STRUCTURED_OUTPUT_TYPES.has(type)) {
    return "OPENAI_STRUCTURED_OUTPUT_INVALID";
  }
  if (
    (type && PROVIDER_UNAVAILABLE_TYPES.has(type)) ||
    (status !== undefined && status >= 500)
  ) {
    return "OPENAI_PROVIDER_UNAVAILABLE";
  }
  return "OPENAI_UNKNOWN_PROVIDER_ERROR";
}

export class LeadAgentProviderError extends Error {
  constructor(
    public readonly category: LeadAgentFailureCategory,
    public readonly metadata: OpenAIErrorMetadata & {
      model: string | null;
      apiKeyPresent: boolean;
      modelEnvironmentPresent: boolean;
      schemaFailure?: SchemaFailureCategory;
    },
  ) {
    super(category);
    this.name = "LeadAgentProviderError";
  }
}

export const leadAgentErrorResponses: Record<
  LeadAgentFailureCategory,
  { status: number; message: string }
> = {
  OPENAI_NOT_CONFIGURED: {
    status: 503,
    message:
      "Live planning is not configured. Set the server-side OPENAI_API_KEY and OPENAI_MODEL values, restart the development server, and try again.",
  },
  OPENAI_INVALID_API_KEY: {
    status: 401,
    message:
      "The OpenAI API key was rejected. Check that the server-side project key is active and belongs to the intended API project.",
  },
  OPENAI_INSUFFICIENT_QUOTA: {
    status: 402,
    message:
      "The OpenAI API project needs available credits or a higher usage limit before live planning can run.",
  },
  OPENAI_MODEL_NOT_AVAILABLE: {
    status: 422,
    message:
      "The configured OpenAI model is unavailable to this API project. Select a model the project can access, then restart the server.",
  },
  OPENAI_MODEL_NOT_SUPPORTED: {
    status: 422,
    message:
      "The configured model does not support Uzoma’s required Responses API structured-output workflow. Configure a compatible model, then restart the server.",
  },
  OPENAI_RATE_LIMITED: {
    status: 429,
    message:
      "The OpenAI API rate limit was reached. Wait briefly, then retry the live planning request.",
  },
  OPENAI_STRUCTURED_OUTPUT_INVALID: {
    status: 502,
    message:
      "The provider response did not match Uzoma’s required delivery-plan format. Retry the request.",
  },
  OPENAI_PROVIDER_UNAVAILABLE: {
    status: 503,
    message:
      "The live planning provider is temporarily unavailable. Wait briefly, then retry the request.",
  },
  OPENAI_UNKNOWN_PROVIDER_ERROR: {
    status: 502,
    message:
      "Live planning failed for an unclassified provider reason. Check the sanitized server diagnostic code before retrying.",
  },
};
