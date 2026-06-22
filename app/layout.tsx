import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { StarField } from "@/components/Arena/shared/StarField";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  weight: ["400", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500"],
});
import { QueryProvider } from "@/components/QueryProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { OnboardingReminder } from "@/components/OnboardingReminder";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { PWAManager } from "@/components/PWAManager";
import { ToastProvider } from "@/components/Toast";
import { GlobalSearchProvider } from "@/contexts/GlobalSearchContext";
import { BetaGate } from "@/components/BetaGate";
import { GlobalMessagesDrawer } from "@/components/GlobalMessagesDrawer";
import { GlobalDuelAmbush } from "@/components/GlobalDuelAmbush";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ScrollRestoration } from "@/components/ScrollRestoration";
import { ClientMonitoring } from "@/components/ClientMonitoring";
import { MessagesDrawerProvider } from "@/contexts/MessagesDrawerContext";
const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://beefs-app.vercel.app");

export const metadata: Metadata = {
  title: {
    default: "Beefs - L'Agora du règlement de comptes",
    template: "%s | Beefs",
  },
  description:
    "L'arène ultime pour régler tes conflits en direct. Lance un beef, affronte tes adversaires sous l'arbitrage d'un Ref et laisse la communauté trancher.",
  keywords: ["beefs", "débats", "live", "streaming", "conflits", "résolution", "tiktok live", "débat en direct", "vote", "challenge"],
  authors: [{ name: "Beefs Team" }],
  creator: "Beefs",
  publisher: "Beefs",
  manifest: "/manifest.json",
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Beefs",
  },
  openGraph: {
    title: "Beefs - L'Agora du règlement de comptes",
    description:
      "L'arène ultime pour régler tes conflits en direct. Lance un beef, affronte tes adversaires sous l'arbitrage d'un Ref et laisse la communauté trancher.",
    type: "website",
    siteName: "Beefs",
    locale: "fr_FR",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Beefs - L'Agora du règlement de comptes",
    description:
      "L'arène ultime pour régler tes conflits en direct. Lance un beef, affronte tes adversaires sous l'arbitrage d'un Ref et laisse la communauté trancher.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  themeColor: "#08080A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

function RootLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <GlobalSearchProvider>
              <ClientMonitoring />
              <MessagesDrawerProvider>
                <BetaGate>
                  <PWAManager />
                  <ScrollRestoration />
                  <StarField />
                  <AppShell>{children}</AppShell>
                  <OnboardingReminder />
                  <PWAInstallPrompt />
                  <GlobalMessagesDrawer />
                  <GlobalDuelAmbush />
                </BetaGate>
              </MessagesDrawerProvider>
            </GlobalSearchProvider>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`overflow-x-hidden ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans overflow-x-hidden bg-[#050505] text-white antialiased">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
