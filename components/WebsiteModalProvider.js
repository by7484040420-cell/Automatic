"use client";

import { createContext, useContext, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

const WebsiteModalContext = createContext(null);

export function useWebsiteModal() {
  const ctx = useContext(WebsiteModalContext);
  if (!ctx) throw new Error("useWebsiteModal must be used inside WebsiteModalProvider");
  return ctx;
}

// Har external website ab seedha native Android WebView mein khulti hai
// (@capgo/inappbrowser). Remote browser / screenshot streaming poori tarah
// hata diya gaya hai. Agar `filled` (AI ki values) di jaaye to WebView mein
// AI khud form bharta hai (lib/nativeAutoFill.js). Normal browser mein
// (app ke bahar) simple naya tab khulta hai.
export default function WebsiteModalProvider({ children }) {
  const openSite = useCallback(async (url, name, filled) => {
    if (!url) return;
    if (Capacitor.isNativePlatform()) {
      try {
        const { openInWebView } = await import("@/lib/nativeAutoFill");
        await openInWebView(url, filled, name);
        return;
      } catch (e) {
        // plugin na mile to normal tab fallback
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const closeSite = useCallback(() => {}, []);

  return (
    <WebsiteModalContext.Provider value={{ openSite, closeSite }}>
      {children}
    </WebsiteModalContext.Provider>
  );
}
