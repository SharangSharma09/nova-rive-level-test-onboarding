import type { Viewport } from "next";
import TianjinFlow from "@/components/TianjinFlow";

export const viewport: Viewport = {
  width: 430,
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function TianjinV1Page() {
  return <TianjinFlow />;
}
