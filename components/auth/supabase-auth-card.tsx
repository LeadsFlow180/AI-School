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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) {
        throw new Error('Login succeeded but user id is missing.');
      }

      // Reason: Only allow admin users to access this app login flow.
      const { data: adminRow, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (adminError) {
        await supabase.auth.signOut();
        throw new Error(`Admin verification failed: ${adminError.message}`);
      }

      if (!adminRow) {
        await supabase.auth.signOut();
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
    <Card className="w-full border-border/80 shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Admin Login</CardTitle>
        <CardDescription>
          Login with your admin account to continue.
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
