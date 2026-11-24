import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "স্মার্ট হাজিরা সিস্টেম | Smart Attendance",
  description: "Modern Employee Attendance & WhatsApp Notification System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn">
      <body className="antialiased bg-slate-50 text-slate-800 min-h-screen">
        {children}
      </body>
    </html>
  );
}
