import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Mail-MCP",
  description: "Local read-only MCP server status",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}
