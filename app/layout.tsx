import type { Metadata } from "next";
import { Suspense } from "react";
import { Poppins, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Whatsupp? — George, by Proven",
  description: "An AI-employee–driven sports-nutrition platform. George, calibrated to Louise Burke.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${plexMono.variable} antialiased`}
    >
      <body className="h-screen overflow-hidden">
        <div className="relative z-[1] flex h-full">
          {/* useSearchParams inside Sidebar needs a Suspense boundary; the
              fallback keeps the rail's width so nothing shifts. */}
          <Suspense fallback={<aside className="w-[248px] shrink-0 border-r border-border bg-bg-1" />}>
            <Sidebar />
          </Suspense>
          <main className="flex-1 flex flex-col overflow-hidden bg-background min-w-0">
            <Topbar />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
