import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "InternTrack", template: "%s · InternTrack" },
  description:
    "Internships, co-ops and student programs from across the web — de-duplicated, summarized, and searchable.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="text-muted-foreground border-t py-6 text-center text-xs">
          Listings come from public company job boards (Greenhouse, Lever, Ashby) and community
          lists on GitHub. Always apply on the employer&apos;s site.
        </footer>
      </body>
    </html>
  );
}
