import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "./components/NavBar";
import { getCurrentUser } from "@/lib/auth";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

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
