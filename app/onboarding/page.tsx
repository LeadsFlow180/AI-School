import type { Metadata } from 'next';
import { CreatorOnboarding } from '@/components/onboarding/creator-onboarding';

export const metadata: Metadata = {
  title: 'Creator profile | Allen Girls Adventure',
  description: 'Set up your course creator profile for personalized AI-generated lessons.',
};

export default function OnboardingPage() {
  return <CreatorOnboarding />;
}
