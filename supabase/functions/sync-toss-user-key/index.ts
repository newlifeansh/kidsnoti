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
    return jsonResponse(
      { message: error instanceof Error ? error.message : "토스 userKey 저장에 실패했어요." },
      { status: 500 },
    );
  }
});

async function exchangeAuthorizationCode(
  authorizationCode: string,
  referrer: "DEFAULT" | "SANDBOX",
) {
  const response = await fetch(`${requireEnv("APPS_IN_TOSS_API_BASE_URL")}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authorizationCode,
      referrer,
    }),
  });

  const body = await response.json() as TossApiSuccess<TokenExchangeSuccess> & TossApiFail;
  if (!response.ok || body.resultType !== "SUCCESS" || !body.success?.accessToken) {
    throw new Error(body.error?.reason ?? "토스 accessToken 교환에 실패했어요.");
  }

  return body.success;
}

async function fetchTossUserKey(accessToken: string) {
  const response = await fetch(`${requireEnv("APPS_IN_TOSS_API_BASE_URL")}/api-partner/v1/apps-in-toss/user/oauth2/login-me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = await response.json() as TossApiSuccess<{ userKey?: string | number }> & TossApiFail;
  if (!response.ok || body.resultType !== "SUCCESS" || body.success?.userKey == null) {
    throw new Error(body.error?.reason ?? "토스 userKey 조회에 실패했어요.");
  }

  return body.success.userKey;
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
