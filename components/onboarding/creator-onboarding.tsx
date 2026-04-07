'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  GraduationCap,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { getSupabaseClient } from '@/lib/supabase/client';

export const CREATOR_PROFILE_STORAGE_KEY = 'creator-profile';
export const CREATOR_ONBOARDING_COMPLETE_KEY = 'creator-onboarding-complete';

export interface CreatorProfileForm {
  displayName: string;
  role: string;
  organization: string;
  audience: string;
  subjects: string;
  bio: string;
}

const ROLE_OPTIONS = [
  { value: 'classroom-teacher', label: 'Classroom teacher' },
  { value: 'professor', label: 'Professor / lecturer' },
  { value: 'instructional-designer', label: 'Instructional designer' },
  { value: 'curriculum-lead', label: 'Curriculum lead' },
  { value: 'corporate-trainer', label: 'Corporate trainer' },
  { value: 'other', label: 'Other' },
] as const;

const AUDIENCE_OPTIONS = [
  { value: 'k5', label: 'Elementary (K–5)' },
  { value: '68', label: 'Middle school (6–8)' },
  { value: '912', label: 'High school (9–12)' },
  { value: 'higher-ed', label: 'Higher education' },
  { value: 'professional', label: 'Professional / adult learning' },
  { value: 'mixed', label: 'Mixed ages' },
] as const;

const initialForm: CreatorProfileForm = {
  displayName: '',
  role: '',
  organization: '',
  audience: '',
  subjects: '',
  bio: '',
};

const STEP_COUNT = 4;

export function CreatorOnboarding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CreatorProfileForm>(initialForm);
  const forceEdit = searchParams.get('edit') === '1';

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      router.replace('/auth?next=/onboarding');
      return;
    }

    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (!data.session) {
        router.replace('/auth?next=/onboarding');
        return;
      }
      setUserId(data.session.user.id);

      // Reason: Load persisted profile from Supabase first so onboarding reflects DB state.
      const { data: profile, error } = await supabase
        .from('creator_profiles')
        .select('display_name, role, organization, audience, subjects, bio')
        .eq('id', data.session.user.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        toast.error(`Failed to load profile from Supabase: ${error.message}`);
      } else if (profile) {
        const hasExistingProfile = !!(
          profile.display_name ||
          profile.role ||
          profile.organization ||
          profile.audience ||
          profile.subjects ||
          profile.bio
        );

        setForm((prev) => ({
          ...prev,
          displayName: profile.display_name ?? prev.displayName,
          role: profile.role ?? prev.role,
          organization: profile.organization ?? prev.organization,
          audience: profile.audience ?? prev.audience,
          subjects: profile.subjects ?? prev.subjects,
          bio: profile.bio ?? prev.bio,
        }));

        if (hasExistingProfile) {
          try {
            localStorage.setItem(CREATOR_ONBOARDING_COMPLETE_KEY, 'true');
          } catch {
            /* ignore localStorage issues */
          }

          if (!forceEdit) {
            router.replace('/');
            return;
          }
        }
      }

      setAuthChecked(true);
    });

    return () => {
      active = false;
    };
  }, [forceEdit, router]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CREATOR_PROFILE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setForm((prev) => ({
        displayName: typeof parsed.displayName === 'string' ? parsed.displayName : prev.displayName,
        role: typeof parsed.role === 'string' ? parsed.role : prev.role,
        organization:
          typeof parsed.organization === 'string' ? parsed.organization : prev.organization,
        audience: typeof parsed.audience === 'string' ? parsed.audience : prev.audience,
        subjects: typeof parsed.subjects === 'string' ? parsed.subjects : prev.subjects,
        bio: typeof parsed.bio === 'string' ? parsed.bio : prev.bio,
      }));
    } catch {
      /* ignore invalid cache */
    }
  }, []);

  const progress = (step / STEP_COUNT) * 100;

  const update = <K extends keyof CreatorProfileForm>(key: K, value: CreatorProfileForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canAdvance = () => {
    if (step === 1) return form.displayName.trim().length >= 2 && form.role.length > 0;
    if (step === 2) return form.organization.trim().length >= 2 && form.audience.length > 0;
    if (step === 3) return true;
    return true;
  };

  const finish = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) {
      toast.error('You must be logged in to save creator profile.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('creator_profiles').upsert({
        id: userId,
        display_name: form.displayName.trim(),
        role: form.role,
        organization: form.organization.trim(),
        audience: form.audience,
        subjects: form.subjects.trim(),
        bio: form.bio.trim(),
      });

      if (error) {
        throw error;
      }

      localStorage.setItem(CREATOR_PROFILE_STORAGE_KEY, JSON.stringify(form));
      localStorage.setItem(CREATOR_ONBOARDING_COMPLETE_KEY, 'true');
      toast.success('Profile Saved');
    } catch {
      toast.error('Failed to save creator profile to Supabase.');
      setSaving(false);
      return;
    }
    setNickname(form.displayName.trim());
    setBio(form.bio.trim());
    setSaving(false);
    router.push('/');
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Checking authentication...
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[oklch(0.985_0.002_250)] dark:bg-[oklch(0.16_0.02_250)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
        style={{
          backgroundImage: `radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.55 0.18 280 / 0.25), transparent),
            radial-gradient(ellipse 60% 40% at 100% 100%, oklch(0.55 0.12 240 / 0.12), transparent)`,
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col px-4 py-10 sm:max-w-xl sm:px-6 lg:max-w-2xl lg:py-14">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card shadow-sm">
              <GraduationCap className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Course creator
              </p>
              <h1 className="font-semibold tracking-tight text-foreground">Profile setup</h1>
            </div>
          </div>
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Skip for now
          </Link>
        </header>

        <div className="mb-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Step {step} of {STEP_COUNT}
            </span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        <Card className="border-border/80 shadow-md">
          <CardHeader className="space-y-1 border-b border-border/60 pb-4">
            <CardTitle className="text-xl font-semibold tracking-tight">
              {step === 1 && 'Introduce yourself'}
              {step === 2 && 'Organization & learners'}
              {step === 3 && 'Focus & background'}
              {step === 4 && 'Review & continue'}
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              {step === 1 &&
                'We use this to personalize AI-generated lessons and classroom tone.'}
              {step === 2 && 'Helps align content difficulty, examples, and vocabulary.'}
              {step === 3 && 'Optional details sharpen subject context and teaching style.'}
              {step === 4 && 'Confirm your details. You can change them later in settings.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="space-y-5"
              >
                {step === 1 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="displayName" className="text-sm font-medium">
                        Display name
                      </Label>
                      <Input
                        id="displayName"
                        placeholder="e.g. Jordan Lee"
                        value={form.displayName}
                        onChange={(e) => update('displayName', e.target.value)}
                        className="h-11"
                        autoComplete="name"
                      />
                      <p className="text-xs text-muted-foreground">
                        Shown in exports and agent interactions where a name is helpful.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role" className="text-sm font-medium">
                        Primary role
                      </Label>
                      <Select value={form.role} onValueChange={(v) => update('role', v)}>
                        <SelectTrigger id="role" className="h-11 w-full">
                          <SelectValue placeholder="Select your role" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="organization" className="flex items-center gap-2 text-sm font-medium">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        School or organization
                      </Label>
                      <Input
                        id="organization"
                        placeholder="e.g. Lincoln High School, Acme Learning"
                        value={form.organization}
                        onChange={(e) => update('organization', e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="audience" className="text-sm font-medium">
                        Primary learner audience
                      </Label>
                      <Select value={form.audience} onValueChange={(v) => update('audience', v)}>
                        <SelectTrigger id="audience" className="h-11 w-full">
                          <SelectValue placeholder="Select audience band" />
                        </SelectTrigger>
                        <SelectContent>
                          {AUDIENCE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="subjects" className="text-sm font-medium">
                        Subjects or topics
                      </Label>
                      <Input
                        id="subjects"
                        placeholder="e.g. Algebra, Biology, Leadership fundamentals"
                        value={form.subjects}
                        onChange={(e) => update('subjects', e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bio" className="flex items-center gap-2 text-sm font-medium">
                        <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        Teaching focus (optional)
                      </Label>
                      <Textarea
                        id="bio"
                        placeholder="Brief context: teaching philosophy, standards you follow, or what makes your courses unique."
                        value={form.bio}
                        onChange={(e) => update('bio', e.target.value)}
                        rows={4}
                        className="min-h-[120px] resize-none"
                      />
                    </div>
                  </>
                )}

                {step === 4 && (
                  <dl className="space-y-4 text-sm">
                    {[
                      ['Display name', form.displayName],
                      [
                        'Role',
                        ROLE_OPTIONS.find((r) => r.value === form.role)?.label ?? form.role,
                      ],
                      ['Organization', form.organization],
                      [
                        'Audience',
                        AUDIENCE_OPTIONS.find((a) => a.value === form.audience)?.label ??
                          form.audience,
                      ],
                      ['Subjects', form.subjects || '—'],
                      ['Teaching focus', form.bio || '—'],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex flex-col gap-0.5 border-b border-border/50 pb-3 last:border-0 last:pb-0 sm:flex-row sm:justify-between"
                      >
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-medium text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-h-10 flex-1 items-center">
                {step > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep((s) => Math.max(1, s - 1))}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                )}
              </div>
              <div className="flex flex-1 justify-end">
                {step < STEP_COUNT ? (
                  <Button
                    type="button"
                    className="w-full sm:w-auto sm:min-w-[140px]"
                    disabled={!canAdvance()}
                    onClick={() => setStep((s) => Math.min(STEP_COUNT, s + 1))}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="w-full sm:w-auto sm:min-w-[180px]"
                    onClick={finish}
                    disabled={saving}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {saving ? 'Saving...' : 'Go to workspace'}
                    <Check className="ml-2 h-4 w-4 opacity-80" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Your creator profile is synced with your Supabase account.
        </p>
      </div>
    </div>
  );
}
