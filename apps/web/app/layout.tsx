import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Softcast",
  description: "Browser-native lighting surfaces controlled from web and mobile."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
