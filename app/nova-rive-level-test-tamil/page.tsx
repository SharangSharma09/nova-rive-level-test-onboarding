import { TAMIL_SENTENCES } from "@/lib/level-test-content";
import NovaRiveLevelTest from "@/components/NovaRiveLevelTest";

export default function Page() {
  return <NovaRiveLevelTest language="tamil" sentences={TAMIL_SENTENCES} />;
}
