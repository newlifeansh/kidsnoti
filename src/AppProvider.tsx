import { TDSMobileProvider, type useUserAgent } from "@toss/tds-mobile";
import { TDSMobileAITProvider } from "@toss/tds-mobile-ait";
import type { ReactNode } from "react";

import config from "../granite.config.ts";

type TDSUserAgent = ReturnType<typeof useUserAgent>;

function isTossAppUserAgent(userAgent: string) {
  return /TossApp\//i.test(userAgent);
}

function getWebUserAgentVariables(userAgent: string): TDSUserAgent {
  return {
    fontA11y: undefined,
    fontScale: 100,
    isAndroid: /Android/i.test(userAgent),
    isIOS: /iPhone|iPad|iPod/i.test(userAgent),
    colorPreference: "light",
    safeAreaBottomTransparency: "opaque",
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const userAgent = window.navigator.userAgent;

  if (isTossAppUserAgent(userAgent)) {
    return (
      <TDSMobileAITProvider brandPrimaryColor={config.brand.primaryColor}>
        {children}
      </TDSMobileAITProvider>
    );
  }

  return (
    <TDSMobileProvider
      resetGlobalCss
      token={{ color: { primary: config.brand.primaryColor } }}
      userAgent={getWebUserAgentVariables(userAgent)}
    >
      {children}
    </TDSMobileProvider>
  );
}
