import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";

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
import { AuthProvider } from "@/contexts/AuthContext";
import { OnboardingReminder } from "@/components/OnboardingReminder";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { PWAManager } from "@/components/PWAManager";
import { ToastProvider } from "@/components/Toast";
import { BetaGate } from "@/components/BetaGate";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ScrollRestoration } from "@/components/ScrollRestoration";
import { ClientMonitoring } from "@/components/ClientMonitoring";
const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://beefs-app.vercel.app");

export const metadata: Metadata = {
  title: {
    default: "Beefs - Débats en live",
    template: "%s | Beefs",
  },
  description: "La plateforme de débats en direct. Crée un beef, invite des challengers, et laisse le public voter. Diffuse, débats et fais-toi entendre.",
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
    title: "Beefs - Débats en live",
    description: "Crée un beef, invite des challengers et laisse le public voter en direct.",
    type: "website",
    siteName: "Beefs",
    locale: "fr_FR",
    url: siteUrl,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Beefs - Débats en live",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Beefs - Débats en live",
    description: "Crée un beef, invite des challengers et laisse le public voter en direct.",
    images: ["/og-image.png"],
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
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <ClientMonitoring />
          <BetaGate>
          <PWAManager />
          <ScrollRestoration />
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
    <html
      lang="fr"
      className={`overflow-x-hidden ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><defs><linearGradient id='g' x1='24' y1='6' x2='24' y2='44' gradientUnits='userSpaceOnUse'><stop stop-color='%23FF6B2C'/><stop offset='.5' stop-color='%23E83A14'/><stop offset='1' stop-color='%23B91C0C'/></linearGradient></defs><path d='M14 42C14 42 8 32 12 22C14.5 16 18 14 20 10C20 10 20 18 24 22C22 18 19 12 22 6C22 6 30 14 32 22C34 14 36 12 36 10C36 10 42 18 40 28C38.5 36 34 42 34 42H14Z' fill='url(%23g)'/><path d='M20 42C20 42 16 36 18 30C19.5 25 22 24 24 20C24 20 26 26 28 28C30 24 30 22 30 20C30 20 35 26 33 32C31.5 37 28 42 28 42H20Z' fill='%23FFD600'/><ellipse cx='24' cy='38' rx='3' ry='4' fill='white' opacity='.85'/></svg>" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#08080A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Beefs" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="font-sans bg-[#08080A] text-white antialiased">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
