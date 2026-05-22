import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface TokenExchangeSuccess {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: string;
  scope?: string;
}

interface TossApiSuccess<T> {
  resultType: "SUCCESS";
  success: T;
}

interface TossApiFail {
  resultType?: string;
  error?: {
    errorCode?: string;
    reason?: string;
  };
}

class PublicFunctionError extends Error {
  constructor(message: string, public code = "TOSS_API_ERROR") {
    super(message);
    this.name = "PublicFunctionError";
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ message: "POST만 지원해요." }, { status: 405 });
  }

  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await request.json() as {
      authorizationCode?: string;
      referrer?: "DEFAULT" | "SANDBOX";
    };

    if (!body.authorizationCode || !body.referrer) {
      return jsonResponse({ message: "authorizationCode와 referrer가 필요해요." }, { status: 400 });
    }

    const token = await exchangeAuthorizationCode(body.authorizationCode, body.referrer);
    const userKey = await fetchTossUserKey(token.accessToken);
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("profiles")
      .update({
        toss_user_key: String(userKey),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) throw error;

    return jsonResponse({ userKey: String(userKey) });
  } catch (error) {
    console.error("sync-toss-user-key failed", serializeErrorForLog(error));
    const diagnostic = toDiagnosticError(error);

    return jsonResponse(
      {
        message: toPublicErrorMessage(error),
        code: diagnostic.code,
        debugMessage: diagnostic.message,
        debugName: diagnostic.name,
      },
      { status: 500 },
    );
  }
});

async function exchangeAuthorizationCode(
  authorizationCode: string,
  referrer: "DEFAULT" | "SANDBOX",
) {
  const response = await fetchTossApi("/api-partner/v1/apps-in-toss/user/oauth2/generate-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authorizationCode,
      referrer,
    }),
  });

  const body = await readTossApiResponse<TokenExchangeSuccess>(response);
  if (!response.ok || body.resultType !== "SUCCESS" || !body.success?.accessToken) {
    throw new PublicFunctionError(
      body.error?.reason ?? "토스 accessToken 교환에 실패했어요.",
      body.error?.errorCode ?? "TOSS_TOKEN_EXCHANGE_FAILED",
    );
  }

  return body.success;
}

async function fetchTossUserKey(accessToken: string) {
  const response = await fetchTossApi("/api-partner/v1/apps-in-toss/user/oauth2/login-me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = await readTossApiResponse<{ userKey?: string | number }>(response);
  if (!response.ok || body.resultType !== "SUCCESS" || body.success?.userKey == null) {
    throw new PublicFunctionError(
      body.error?.reason ?? "토스 userKey 조회에 실패했어요.",
      body.error?.errorCode ?? "TOSS_USER_KEY_LOOKUP_FAILED",
    );
  }

  return body.success.userKey;
}

async function fetchTossApi(path: string, init: RequestInit) {
  const client = createTossMutualTlsClient();
  const requestInit = client ? { ...init, client } as RequestInit : init;
  return fetch(`${requireEnv("APPS_IN_TOSS_API_BASE_URL")}${path}`, requestInit);
}

async function readTossApiResponse<T>(response: Response) {
  try {
    return await response.json() as TossApiSuccess<T> & TossApiFail;
  } catch {
    return {
      resultType: "FAIL",
      error: {
        reason: "토스 로그인 API 응답을 확인하지 못했어요.",
      },
    } satisfies TossApiFail;
  }
}

function createTossMutualTlsClient() {
  const cert = readPemSecret("APPS_IN_TOSS_MTLS_CERT_PEM", "APPS_IN_TOSS_MTLS_CERT_BASE64");
  const key = readPemSecret("APPS_IN_TOSS_MTLS_KEY_PEM", "APPS_IN_TOSS_MTLS_KEY_BASE64");

  if (!cert && !key) {
    return undefined;
  }

  if (!cert || !key) {
    throw new PublicFunctionError("토스 로그인 API 인증서 설정을 확인해주세요.", "TOSS_MTLS_SECRET_INCOMPLETE");
  }

  const deno = Deno as typeof Deno & {
    createHttpClient?: (options: { cert: string; key: string }) => unknown;
  };

  if (typeof deno.createHttpClient !== "function") {
    throw new PublicFunctionError("토스 로그인 API 인증서 연결을 준비하지 못했어요.", "TOSS_MTLS_UNSUPPORTED_RUNTIME");
  }

  return deno.createHttpClient({ cert, key });
}

function readPemSecret(pemName: string, base64Name: string) {
  const pemValue = Deno.env.get(pemName);
  if (pemValue) return pemValue.replace(/\\n/g, "\n");

  const base64Value = Deno.env.get(base64Name);
  if (!base64Value) return undefined;

  try {
    return atob(base64Value).replace(/\\n/g, "\n");
  } catch {
    throw new PublicFunctionError(`${base64Name} 값을 읽지 못했어요.`, "TOSS_MTLS_SECRET_DECODE_FAILED");
  }
}

async function getAuthenticatedUserId(request: Request) {
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "");
  if (!accessToken) {
    throw new Error("Supabase 로그인이 필요해요.");
  }

  const { data, error } = await createServiceClient().auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("Supabase 사용자 확인에 실패했어요.");
  }

  return data.user.id;
}

function createServiceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} 환경변수가 필요해요.`);
  }
  return value;
}

function toPublicErrorMessage(error: unknown) {
  const fallback = "토스 로그인 연결을 완료하지 못했어요. 잠시 후 다시 시도해주세요.";

  if (error instanceof PublicFunctionError) {
    const lowerMessage = error.message.toLowerCase();
    if (
      error.message.includes("CertificateRequired") ||
      error.message.includes("SendRequest") ||
      error.message.includes("invalid_grant") ||
      error.message.includes("authorization_code") ||
      error.message.includes("clientId") ||
      lowerMessage.includes("connection error") ||
      lowerMessage.includes("client error")
    ) {
      return fallback;
    }

    return error.message;
  }

  if (error instanceof Error) {
    const lowerMessage = error.message.toLowerCase();
    if (
      error.message.includes("CertificateRequired") ||
      error.message.includes("SendRequest") ||
      error.message.includes("apps-in-toss-api") ||
      error.message.includes("invalid_grant") ||
      error.message.includes("authorization_code") ||
      error.message.includes("clientId") ||
      lowerMessage.includes("connection error") ||
      lowerMessage.includes("client error") ||
      lowerMessage.includes("fetch")
    ) {
      return fallback;
    }
  }

  return fallback;
}

function toDiagnosticError(error: unknown) {
  if (error instanceof PublicFunctionError) {
    return {
      code: error.code,
      message: error.message,
      name: error.name,
    };
  }

  if (error instanceof Error) {
    return {
      code: "SYNC_TOSS_USER_KEY_FAILED",
      message: error.message,
      name: error.name,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record.code === "string" ? record.code : "SYNC_TOSS_USER_KEY_FAILED",
      message: stringifyUnknownError(error),
      name: typeof record.name === "string" ? record.name : "ObjectError",
    };
  }

  return {
    code: "SYNC_TOSS_USER_KEY_FAILED",
    message: String(error),
    name: "UnknownError",
  };
}

function serializeErrorForLog(error: unknown) {
  if (error instanceof Error) {
    const record = error as Error & { code?: unknown };
    return {
      code: record.code,
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: record.code,
      details: record.details,
      hint: record.hint,
      message: stringifyUnknownError(error),
      name: record.name,
      status: record.status,
    };
  }

  return { message: String(error) };
}

function stringifyUnknownError(error: unknown) {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return String(error);

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
