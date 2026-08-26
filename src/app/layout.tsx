import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import "./globals.css";
import NavBar from "./components/NavBar";
import { getCurrentUser } from "@/lib/auth";
import { isSiteLocked } from "@/lib/siteLock";
import { BetSlipProvider } from "./lines/BetSlipContext";
import BetSlip from "./lines/BetSlip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bettor Edge",
  description: "Play-money picks and leaderboards with your friends",
};

// Live bet placement holds for ~10s (re-checking the line hasn't moved)
// before committing — comfortably under this, but the platform default
// (10s on some plans) wouldn't be. Applies to every route since the bet
// slip (and its placeParlayAction) lives in this root layout.
export const maxDuration = 30;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  // Site-wide lock, re-checked from the DB on every request (not baked into
  // the JWT) so it takes effect immediately for already-logged-in users too.
  // Skips /locked itself (avoids a redirect loop) and signed-out visitors
  // (proxy.ts already routes them to /login regardless).
  if (user && !user.is_admin) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (pathname !== "/locked" && (await isSiteLocked())) {
      redirect("/locked");
    }
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BetSlipProvider>
          <NavBar />
          {children}
          <BetSlip freePlayBalance={user ? Number(user.free_play) : 0} />
        </BetSlipProvider>
      </body>
    </html>
  );
}
