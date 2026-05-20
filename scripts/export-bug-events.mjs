import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key, rest.join("=").replace(/^['"]|['"]$/g, "")];
      }),
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const localEnv = loadEnvFile(path.join(projectRoot, ".env.local"));
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? localEnv.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    localEnv.VITE_SUPABASE_PUBLISHABLE_KEY ??
    localEnv.VITE_SUPABASE_ANON_KEY;
  const schedulerSecret = args["scheduler-secret"] ?? process.env.BUG_EVENTS_EXPORT_SECRET;
  const limit = Number(args.limit ?? "100");

  if (!supabaseUrl || !publishableKey) {
    throw new Error(".env.local에서 Supabase URL 또는 publishable key를 찾지 못했어요.");
  }

  if (!schedulerSecret) {
    throw new Error("--scheduler-secret 또는 BUG_EVENTS_EXPORT_SECRET 환경변수가 필요해요.");
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInAnonymously({
    options: {
      data: {
        identity_source: "bug-export-script",
        toss_user_hash: `bug-export-${Date.now()}`,
      },
    },
  });

  if (error || !data.session?.access_token) {
    throw error ?? new Error("익명 세션 생성에 실패했어요.");
  }

  const requestUrl = `${supabaseUrl}/functions/v1/export-bug-events-to-sheet?limit=${Number.isFinite(limit) ? limit : 100}`;
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${data.session.access_token}`,
      "x-scheduler-secret": schedulerSecret,
    },
    body: "{}",
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`export failed: ${response.status} ${response.statusText} ${responseText}`);
  }

  console.log(responseText);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
