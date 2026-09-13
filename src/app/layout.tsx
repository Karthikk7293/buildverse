import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buildverse — Better built together",
  description: "Two builders. One forest. Ten minutes. Collect, collaborate, and bring your woodland blueprint to life in a real-time 3D building adventure.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
