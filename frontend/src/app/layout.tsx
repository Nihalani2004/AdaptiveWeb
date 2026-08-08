import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AdaptiveWeb - Intelligent UI Adaptation',
  description: 'A browser extension that adapts the web to your behavior.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* We can inject the extension script here for the DEMO page specifically 
            so users don't need the extension installed to verify the behavior on THIS page.
            Or we rely on the extension being installed. 
            PRD says "Standalone embeddable script version".
            So we should include a script tag here for the demo? 
            Let's assume we serve injected.js from public/ or via raw fetch?
            Ideally, we just let the USER install the extension.
            BUT, for a 'Demo' page, it's nice if it works out of the box.
            I will NOT auto-inject here to strictly test the Extension logic as a separate entity 
            initially, but per PRD "Standalone embeddable script version" exists.
            I'll stick to clean layout for now.
        */}
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
