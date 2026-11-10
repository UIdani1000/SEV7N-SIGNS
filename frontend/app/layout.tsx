import type { Metadata, Viewport } from "next";
import { Anton, Montserrat } from "next/font/google";
import "./globals.css";

const display = Anton({ weight: "400", subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Montserrat({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "SEV7N SIGNS",
  description: "Tested trading signals with honest numbers. Powered by SEV7N FOLD.",
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#efebe4" }, { media: "(prefers-color-scheme: dark)", color: "#131315" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
