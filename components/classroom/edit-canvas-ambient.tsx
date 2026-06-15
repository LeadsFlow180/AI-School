/** Subtle studio backdrop aligned with app primary (violet). */
export function EditCanvasAmbient() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-background" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-30%,hsl(var(--primary)/0.14),transparent_55%)]" />
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.2]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />
    </div>
  );
}
