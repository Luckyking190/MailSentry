import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_TAGLINE } from "@/components/Logo";

// Inter for narrative text, JetBrains Mono for every technical readout —
// the bifurcated strategy the design system specifies.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: { default: `${APP_NAME} — Email Threat Detection`, template: `%s · ${APP_NAME}` },
  description: APP_TAGLINE,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        {/*
          Material Symbols must be a real <link>: next/font/google does not
          carry it ("Unknown font"), and a CSS @import was dropped during the
          Tailwind build. Without the font every icon renders its ligature name
          as literal text. The lint rule below targets pages/_document; in the
          App Router a root-layout link applies to every route.
        */}
        {/*
          `display=block` is deliberate and the rule below is wrong for this
          case: with `swap`, an icon font renders its ligature name as visible
          text until the face arrives — "arrow_forward" in place of an arrow.
          Blank-then-glyph is the correct trade for icons.
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="min-h-full flex flex-col bg-surface text-on-surface">
        {children}
      </body>
    </html>
  );
}
