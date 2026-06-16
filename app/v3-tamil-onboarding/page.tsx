import NovaOnboarding from "@/components/NovaOnboarding";
import { TAMIL_SCREENS, ONBOARDING_VIDEO_URL, VIDEO_CTA } from "@/lib/onboardingCopy";

export default function V3TamilOnboardingPage() {
  return (
    <NovaOnboarding
      screens={TAMIL_SCREENS}
      videoUrl={ONBOARDING_VIDEO_URL}
      videoCta={VIDEO_CTA}
      redirectTo="/v3-tamil"
    />
  );
}
