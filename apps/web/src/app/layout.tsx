import type { Metadata, Viewport } from "next";

import { siteDescription, siteUrl } from "@/data/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ExploreWise — Explore More. Spend Wisely.",
    template: "%s | ExploreWise",
  },
  description: siteDescription,
  applicationName: "ExploreWise",
  authors: [{ name: "Inventra Systems" }],
  creator: "Inventra Systems",
  publisher: "Inventra Systems",
  keywords: [
    "ExploreWise",
    "Metro Manila",
    "local discovery",
    "things to do",
    "budget-friendly activities",
    "restaurants",
    "events",
    "itineraries",
  ],
  category: "travel",
  openGraph: {
    type: "website",
    locale: "en_PH",
    url: siteUrl,
    siteName: "ExploreWise",
    title: "ExploreWise — Explore More. Spend Wisely.",
    description: siteDescription,
  },
  twitter: {
    card: "summary",
    title: "ExploreWise — Explore More. Spend Wisely.",
    description: siteDescription,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f4ea",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
