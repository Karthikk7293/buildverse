import type { Metadata } from "next";
import CameraCheck from "@/components/engine/CameraCheck";

export const metadata: Metadata = { title: "Buildverse — Camera Check", description: "Test the laptop camera independently of the engine and hand tracking." };
export default function CameraCheckPage() { return <CameraCheck />; }
