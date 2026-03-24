import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { AuthProvider } from "@/contexts/AuthContext";
import { OnboardingReminder } from "@/components/OnboardingReminder";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { PWAManager } from "@/components/PWAManager";
import { ToastProvider } from "@/components/Toast";
import { BetaGate } from "@/components/BetaGate";
import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "Beefs - Règle tes conflits en live",
  description: "La plateforme pour résoudre tes beefs en direct. Diffuse, débats et fais-toi entendre.",
  keywords: ["beefs", "débats", "live", "streaming", "conflits", "résolution"],
  authors: [{ name: "Beefs Team" }],
  manifest: "/manifest.json",
  themeColor: "#E83A14",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Beefs",
  },
  openGraph: {
    title: "Beefs - Règle tes conflits en live",
    description: "La plateforme pour résoudre tes beefs en direct",
    type: "website",
  },
};

function RootLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <BetaGate>
          <PWAManager />
          <Header />
          <main className="pt-14">
            {children}
          </main>
          <OnboardingReminder />
          <PWAInstallPrompt />
          </BetaGate>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><defs><linearGradient id='g' x1='24' y1='6' x2='24' y2='44' gradientUnits='userSpaceOnUse'><stop stop-color='%23FF6B2C'/><stop offset='.5' stop-color='%23E83A14'/><stop offset='1' stop-color='%23B91C0C'/></linearGradient></defs><path d='M14 42C14 42 8 32 12 22C14.5 16 18 14 20 10C20 10 20 18 24 22C22 18 19 12 22 6C22 6 30 14 32 22C34 14 36 12 36 10C36 10 42 18 40 28C38.5 36 34 42 34 42H14Z' fill='url(%23g)'/><path d='M20 42C20 42 16 36 18 30C19.5 25 22 24 24 20C24 20 26 26 28 28C30 24 30 22 30 20C30 20 35 26 33 32C31.5 37 28 42 28 42H20Z' fill='%23FFD600'/><ellipse cx='24' cy='38' rx='3' ry='4' fill='white' opacity='.85'/></svg>" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#E83A14" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Beefs" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="bg-black text-white antialiased">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
