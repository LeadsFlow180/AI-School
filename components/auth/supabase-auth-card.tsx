'use client';

import { useMemo, useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseClient } from '@/lib/supabase/client';

interface SupabaseAuthCardProps {
  onAuthenticated?: () => void;
}

export function SupabaseAuthCard({ onAuthenticated }: SupabaseAuthCardProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = useMemo(() => getSupabaseClient(), []);

  const isSupabaseConfigured = !!supabase;

  const verifyAdminStatus = async (token: string) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch('/api/auth/admin-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          credentials: 'omit',
          cache: 'no-store',
        });
        if (res.ok) {
          const json = (await res.json()) as { isAdmin?: boolean };
          return !!json.isAdmin;
        }
      } catch {
        // Retry below.
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!supabase) {
      toast.error('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      return;
    }

    if (!email.trim() || !password.trim()) {
      toast.error('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;

      const userId = data.user?.id;
      const accessToken = data.session?.access_token;
      if (!userId) {
        throw new Error('Login succeeded but user id is missing.');
      }
      if (!accessToken) {
        await supabase.auth.signOut({ scope: 'local' });
        throw new Error('Login succeeded but session token is missing. Please try again.');
      }

      // Reason: Only allow admin users to access this app login flow.
      const isAdmin = await verifyAdminStatus(accessToken);
      if (!isAdmin) {
        await supabase.auth.signOut({ scope: 'local' });
        throw new Error('Access denied. Your account is not an admin user.');
      }

      toast.success('Admin login successful.');
      onAuthenticated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full border-slate-200/80 bg-white/90 shadow-xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/85">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold tracking-tight">Admin Login</CardTitle>
        <CardDescription>
          Login with your admin email and password to access classroom controls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isSupabaseConfigured && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
            Supabase env vars are missing. Add `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading || !isSupabaseConfigured}>
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Please wait...
              </>
            ) : (
              <>
                <LogIn className="mr-2 size-4" />
                Login
              </>
            )}
          </Button>
        </form>

      </CardContent>
    </Card>
  );
}
