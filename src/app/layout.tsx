import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediReach — Medical Email Marketing",
  description:
    "Compliant email marketing for the medical sector: mail merge, connected mailboxes, and AI-assisted content.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
