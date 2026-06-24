export function getOpenAIAvailability(environment: {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}) {
  const apiKeyPresent = Boolean(environment.OPENAI_API_KEY?.trim());
  const model = environment.OPENAI_MODEL?.trim() || undefined;
  const modelPresent = Boolean(model);
  return {
    configured: apiKeyPresent && modelPresent,
    model,
    apiKeyPresent,
    modelPresent,
    reason: !apiKeyPresent
      ? ("missing_api_key" as const)
      : !modelPresent
        ? ("missing_model" as const)
        : undefined,
  };
}
