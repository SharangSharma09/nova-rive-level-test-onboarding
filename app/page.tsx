import { HINDI_SENTENCES } from "@/lib/level-test-content";
import RiveVariantHarness from "@/components/RiveVariantHarness";

export default function Home() {
  return <RiveVariantHarness language="hindi" sentences={HINDI_SENTENCES} />;
}
