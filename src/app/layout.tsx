import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

/**
 * Inter — clean, professional sans-serif font well-suited for academic UI.
 * Loaded from Google Fonts via Next.js font optimisation (zero layout shift).
 */
const inter = Inter({ subsets: ["latin"] });

/**
 * Root metadata for the Examint application.
 * Displayed in browser tabs and search engine results.
 */
export const metadata: Metadata = {
  title: {
    default: "Examint",
    template: "%s | Examint",
  },
  description:
    "Examint — Snap. Select. Set the paper. The question paper composer for teachers.",
};

/**
 * Root Layout
 *
 * The root layout wraps every page in the application. It:
 * - Applies the Inter font to the entire document.
 * - Renders the global Toaster so toast notifications (from `sonner`) work
 *   on every page without importing Toaster in each individual component.
 * - Does NOT include a Navbar or sidebar here — those are added by the
 *   nested (app) route group layout, keeping the (auth) pages clean.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        {/*
         * Toaster from `sonner` — renders toast notifications.
         * `position="top-right"` keeps them out of the way of content.
         * `richColors` applies semantic colors (green for success, red for error).
         */}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
