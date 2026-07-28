import type { Viewport } from "next";
import TianjinDemo from "@/components/TianjinDemo";

export const viewport: Viewport = {
  width: 430,
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function NovaWidgetOnboardingHinglishPage() {
  return <TianjinDemo />;
}
