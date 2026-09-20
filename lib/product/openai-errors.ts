const configurationErrorCodes = new Set([
  "credit_balance_exhausted",
  "insufficient_quota",
  "invalid_api_key",
  "model_not_found",
]);

export class ProviderConfigurationError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "ProviderConfigurationError";
  }
}

export async function openAIResponseError(response: Response, context: string): Promise<Error> {
  let providerCode = "";
  try {
    const payload = await response.json() as { error?: { code?: unknown; type?: unknown } };
    providerCode = normalizeProviderCode(payload.error?.code) || normalizeProviderCode(payload.error?.type);
  } catch {
    providerCode = "";
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderConfigurationError("PROVIDER_CONFIGURATION_OPENAI_AUTHENTICATION_FAILED");
  }
  if (response.status === 429 && configurationErrorCodes.has(providerCode)) {
    return new ProviderConfigurationError("PROVIDER_CONFIGURATION_OPENAI_CREDITS_EXHAUSTED");
  }
  if ((response.status === 400 || response.status === 404) && providerCode === "model_not_found") {
    return new ProviderConfigurationError("PROVIDER_CONFIGURATION_OPENAI_MODEL_UNAVAILABLE");
  }
  if (response.status === 429) return new Error(`${context}_RATE_LIMITED`);
  return new Error(`${context}_HTTP_${response.status}`);
}

export function providerErrorCode(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(":", 1)[0].replace(/[^A-Z0-9_]/gi, "_").slice(0, 80) || fallback;
}

function normalizeProviderCode(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_") : "";
}
