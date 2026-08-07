import { TAMIL_SENTENCES } from "@/lib/level-test-content";
import RiveVariantHarness from "@/components/RiveVariantHarness";

export default function Page() {
  return <RiveVariantHarness language="tamil" sentences={TAMIL_SENTENCES} />;
}
