import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "K-Synthesizer",
  description:
    "Advanced AI-powered trading signal analysis dashboard. Real-time MT5 data, SYNTHESIZER AI insights, live price feeds.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
