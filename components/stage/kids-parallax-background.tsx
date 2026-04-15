'use client';

export function KidsParallaxBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#fef9c3_0%,#fce7f3_38%,#dbeafe_70%,#f8fafc_100%)] opacity-14" />
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))]" />

      <div className="absolute -top-14 -left-8 h-48 w-48 rounded-full bg-fuchsia-200/45 blur-2xl" />
      <div className="absolute top-8 right-8 h-44 w-44 rounded-full bg-sky-200/44 blur-2xl" />
      <div className="absolute bottom-8 left-1/3 h-52 w-52 rounded-full bg-violet-200/38 blur-3xl" />
    </div>
  );
}
