import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

const calendarScope = "https://www.googleapis.com/auth/calendar.events";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return jsonResponse({ message: "GET만 지원해요." }, { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (code && state) {
      return await handleOAuthCallback(code, state);
    }

    return await createOAuthUrl(request);
  } catch (error) {
    return jsonResponse(
      { message: error instanceof Error ? error.message : "Google Calendar 연동에 실패했어요." },
      { status: 500 },
    );
  }
});

async function createOAuthUrl(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  const state = await signState({
    userId,
    nonce: crypto.randomUUID(),
    createdAt: Date.now(),
  });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", requireEnv("GOOGLE_CALENDAR_CLIENT_ID"));
  authUrl.searchParams.set("redirect_uri", requireEnv("GOOGLE_CALENDAR_REDIRECT_URI"));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", calendarScope);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", state);

  return jsonResponse({ authUrl: authUrl.toString() });
}

async function handleOAuthCallback(code: string, state: string) {
  const payload = await verifyState(state);
  const token = await exchangeCodeForToken(code);
  if (!token.refresh_token) {
    throw new Error("Google refresh token을 받지 못했어요. 다시 연결을 시도해주세요.");
  }

  const supabase = createServiceClient();
  const encryptedRefreshToken = await encryptText(token.refresh_token);
  const accessTokenExpiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null;

  const { error } = await supabase
    .from("calendar_connections")
    .upsert(
      {
        user_id: payload.userId,
        provider: "google",
        calendar_id: "primary",
        encrypted_refresh_token: encryptedRefreshToken,
        access_token_expires_at: accessTokenExpiresAt,
      },
      { onConflict: "user_id,provider,calendar_id" },
    );

  if (error) throw error;

  const redirectUrl = Deno.env.get("CALENDAR_OAUTH_SUCCESS_REDIRECT_URL") ?? "http://localhost:5173/?calendar=connected";
  const location = new URL(redirectUrl);
  location.searchParams.set("calendar", "connected");

  return new Response(null, {
    status: 302,
    headers: {
      Location: location.toString(),
      ...corsHeaders,
    },
  });
}

async function exchangeCodeForToken(code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      redirect_uri: requireEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });

  const body = await response.json() as GoogleTokenResponse;
  if (!response.ok) {
    throw new Error(body.error_description ?? body.error ?? "Google OAuth token 교환에 실패했어요.");
  }

  return body;
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

async function signState(payload: { userId: string; nonce: string; createdAt: number }) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

async function verifyState(state: string) {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("OAuth state가 올바르지 않아요.");
  }

  const expected = await hmac(encodedPayload);
  if (signature !== expected) {
    throw new Error("OAuth state 검증에 실패했어요.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as {
    userId?: string;
    nonce?: string;
    createdAt?: number;
  };
  if (!payload.userId || !payload.createdAt) {
    throw new Error("OAuth state 정보가 부족해요.");
  }
  if (Date.now() - payload.createdAt > 10 * 60 * 1000) {
    throw new Error("OAuth state가 만료되었어요.");
  }

  return { userId: payload.userId };
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireEnv("TOKEN_ENCRYPTION_KEY")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(signature);
}

async function encryptText(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey();
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text),
  );

  return `${base64UrlEncode(iv)}.${base64UrlEncode(cipher)}`;
}

async function aesKey() {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(requireEnv("TOKEN_ENCRYPTION_KEY")),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
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

function base64UrlEncode(value: string | ArrayBuffer | Uint8Array) {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value instanceof Uint8Array
    ? value
    : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
