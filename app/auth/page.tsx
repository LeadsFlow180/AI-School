import { AuthPageClient } from './auth-page-client';

// Force dynamic rendering to prevent static export issues
export const dynamic = 'force-dynamic';

export default function AuthPage() {
  return <AuthPageClient />;
}
