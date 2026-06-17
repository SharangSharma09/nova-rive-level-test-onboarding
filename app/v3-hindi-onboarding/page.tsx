import NovaOnboarding from "@/components/NovaOnboarding";
import { HINDI_SCREENS, ONBOARDING_VIDEO_URL, VIDEO_CTA } from "@/lib/onboardingCopy";

export default function V3HindiOnboardingPage() {
  return (
    <NovaOnboarding
      screens={HINDI_SCREENS}
      videoUrl={ONBOARDING_VIDEO_URL}
      videoCta={VIDEO_CTA}
      redirectTo="/v3-hindi"
      lang="hi"
    />
  );
}
