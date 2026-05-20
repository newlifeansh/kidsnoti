import { getAnonymousKey } from "@apps-in-toss/web-framework";

const DEV_TOSS_USER_HASH_KEY = "alimjangssok.devTossUserHash";

export interface AppsInTossIdentity {
  userHash: string;
  source: "apps-in-toss" | "local-dev";
}

export async function getAppsInTossIdentity(): Promise<AppsInTossIdentity> {
  try {
    const result = await getAnonymousKey();

    if (result && result !== "ERROR" && result.type === "HASH") {
      return {
        userHash: result.hash,
        source: "apps-in-toss",
      };
    }
  } catch {
    // Local browser does not provide the Apps in Toss native bridge.
  }

  return {
    userHash: getLocalDevUserHash(),
    source: "local-dev",
  };
}

function getLocalDevUserHash() {
  const saved = window.localStorage.getItem(DEV_TOSS_USER_HASH_KEY);
  if (saved) return saved;

  const generated = `local-dev-${crypto.randomUUID()}`;
  window.localStorage.setItem(DEV_TOSS_USER_HASH_KEY, generated);
  return generated;
}
