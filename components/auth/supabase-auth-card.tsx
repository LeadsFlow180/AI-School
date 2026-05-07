'use client';

import { useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
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
        <PasswordMascot isPasswordVisible={showPassword} />
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
            <div className="relative">
              <Input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="pr-11"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
                disabled={loading}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
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

function PasswordMascot({ isPasswordVisible }: { isPasswordVisible: boolean }) {
  return (
    <div className="mb-3 flex justify-center">
      <div className="relative size-24 rounded-full bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-2 shadow-inner ring-1 ring-indigo-100 dark:from-slate-800 dark:via-slate-900 dark:to-indigo-950 dark:ring-slate-700">
        <svg viewBox="0 0 120 120" role="img" aria-label="Password helper mascot" className="size-full">
          <defs>
            <linearGradient id="authMascotFace" x1="20" y1="16" x2="96" y2="102">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="100%" stopColor="#F9A8D4" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="58" r="38" fill="url(#authMascotFace)" />
          <g
            className={isPasswordVisible ? 'transition-transform duration-500 ease-out scale-y-0' : 'transition-transform duration-500 ease-out scale-y-100'}
            style={{ transformOrigin: '45px 54px' }}
          >
            <circle cx="45" cy="54" r="11" fill="#fff" />
          </g>
          <g
            className={isPasswordVisible ? 'transition-transform duration-500 ease-out scale-y-0' : 'transition-transform duration-500 ease-out scale-y-100'}
            style={{ transformOrigin: '75px 54px' }}
          >
            <circle cx="75" cy="54" r="11" fill="#fff" />
          </g>
          {!isPasswordVisible ? (
            <>
              <circle cy="55" r="4.2" fill="#334155">
                <animate attributeName="cx" values="42;48;42;45;42" dur="3.4s" repeatCount="indefinite" />
              </circle>
              <circle cy="55" r="4.2" fill="#334155">
                <animate attributeName="cx" values="72;78;72;75;72" dur="3.4s" repeatCount="indefinite" />
              </circle>
              <path
                d="M45 76c7 6 23 6 30 0"
                fill="none"
                stroke="#334155"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <path
                d="M34 55c7 7 15 7 22 0"
                fill="none"
                stroke="#334155"
                strokeWidth="4.2"
                strokeLinecap="round"
                className="animate-[auth-eye-close_700ms_ease-out]"
              />
              <path
                d="M64 55c7 7 15 7 22 0"
                fill="none"
                stroke="#334155"
                strokeWidth="4.2"
                strokeLinecap="round"
                className="animate-[auth-eye-close_700ms_ease-out]"
              />
              <path d="M38 50l-4-4" stroke="#334155" strokeWidth="2.3" strokeLinecap="round" />
              <path d="M45 48l-1-5" stroke="#334155" strokeWidth="2.3" strokeLinecap="round" />
              <path d="M52 50l4-4" stroke="#334155" strokeWidth="2.3" strokeLinecap="round" />
              <path d="M68 50l-4-4" stroke="#334155" strokeWidth="2.3" strokeLinecap="round" />
              <path d="M75 48l1-5" stroke="#334155" strokeWidth="2.3" strokeLinecap="round" />
              <path d="M82 50l4-4" stroke="#334155" strokeWidth="2.3" strokeLinecap="round" />
              <path
                d="M45 78c8 4 22 4 30 0"
                fill="none"
                stroke="#334155"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <g>
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="0 0;0 -3;0 0"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <ellipse cx="37" cy="58" rx="13" ry="8" fill="#FCD34D" opacity="0.92" />
                <ellipse cx="83" cy="58" rx="13" ry="8" fill="#FCD34D" opacity="0.92" />
              </g>
            </>
          )}
          <circle cx="33" cy="68" r="5" fill="#FB7185" opacity="0.34" />
          <circle cx="87" cy="68" r="5" fill="#FB7185" opacity="0.34" />
          <path
            d="M28 30c-8-11 7-20 15-8"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M92 30c8-11-7-20-15-8"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
