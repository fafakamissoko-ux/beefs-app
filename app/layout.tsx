import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { AuthProvider } from "@/contexts/AuthContext";
import { OnboardingReminder } from "@/components/OnboardingReminder";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { PWAManager } from "@/components/PWAManager";

export const metadata: Metadata = {
  title: "Beefs - Règle tes conflits en live",
  description: "La plateforme pour résoudre tes beefs en direct. Diffuse, débats et fais-toi entendre.",
  keywords: ["beefs", "débats", "live", "streaming", "conflits", "résolution"],
  authors: [{ name: "Beefs Team" }],
  manifest: "/manifest.json",
  themeColor: "#FF6B35",
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
      <PWAManager />
      <Header />
      <main className="pt-16">
        {children}
      </main>
      <OnboardingReminder />
      <PWAInstallPrompt />
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
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='0%' y2='100%'><stop offset='0%' stop-color='%23FF0000'/><stop offset='100%' stop-color='%23FF6B35'/></linearGradient></defs><path d='M50 10 L35 40 L25 35 L30 60 L15 65 L35 85 L40 70 L50 90 L60 70 L65 85 L85 65 L70 60 L75 35 L65 40 L50 10Z' fill='url(%23g)'/></svg>" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FF6B35" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Beefs" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="m-0 p-0 bg-black text-white antialiased">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
