import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "agentlens",
  description: "Directory tree for a GitHub repository. Replace github.com with this host.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          margin: "1.5rem",
          lineHeight: 1.45,
        }}
      >
        {children}
      </body>
    </html>
  );
}
