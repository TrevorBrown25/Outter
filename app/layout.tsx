import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outter — golf outings, live",
  description: "Organize the round, track every stroke, and settle the skins — live on every phone.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
