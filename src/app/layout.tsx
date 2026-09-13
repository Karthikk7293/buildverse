import type { Metadata } from "next";
import "./engine.css";

export const metadata: Metadata = {
  title: "Kinetic — Interactive Engine Lab",
  description: "Take a single-cylinder engine apart, explore every angle, and put it back in motion. An interactive 3D engine workbench with local webcam hand controls.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
