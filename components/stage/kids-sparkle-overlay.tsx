'use client';

const SPARKLE_STARS = [
  // Left empty zone near guide mascot
  { left: '6%', top: '18%', size: 13, delay: '0s', duration: '6.6s' },
  { left: '10%', top: '34%', size: 10, delay: '1.2s', duration: '7.3s' },
  { left: '15%', top: '56%', size: 12, delay: '2.1s', duration: '7.9s' },
  { left: '21%', top: '24%', size: 9, delay: '0.7s', duration: '6.9s' },
  // Right empty zone near chat mascot
  { left: '79%', top: '20%', size: 12, delay: '0.5s', duration: '7.1s' },
  { left: '84%', top: '42%', size: 10, delay: '1.8s', duration: '8.1s' },
  { left: '90%', top: '62%', size: 13, delay: '2.6s', duration: '7.5s' },
  { left: '95%', top: '34%', size: 9, delay: '0.3s', duration: '6.8s' },
  // A few top accents
  { left: '31%', top: '12%', size: 8, delay: '1.6s', duration: '7.7s' },
  { left: '69%', top: '10%', size: 8, delay: '2.4s', duration: '8.2s' },
] as const;

export function KidsSparkleOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[26] overflow-hidden">
      {SPARKLE_STARS.map((star, index) => (
        <span
          key={`${star.left}-${star.top}`}
          className="kids-sparkle absolute"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            animationDelay: star.delay,
            animationDuration: star.duration,
            opacity: 0.38 + (index % 3) * 0.1,
          }}
        />
      ))}

      <style jsx>{`
        .kids-sparkle {
          transform-origin: center;
          border-radius: 9999px;
          background: radial-gradient(
            circle at center,
            rgba(255, 255, 255, 0.98) 0%,
            rgba(224, 242, 254, 0.78) 34%,
            rgba(254, 240, 138, 0.3) 64%,
            rgba(255, 255, 255, 0) 100%
          );
          filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.76))
            drop-shadow(0 0 10px rgba(56, 189, 248, 0.36));
          animation-name: kids-sparkle-twinkle;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
        }

        .kids-sparkle::before,
        .kids-sparkle::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          border-radius: 9999px;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.98) 0%,
            rgba(125, 211, 252, 0.75) 64%,
            rgba(255, 255, 255, 0.1) 100%
          );
        }

        .kids-sparkle::before {
          width: 2px;
          height: 100%;
          opacity: 0.82;
        }

        .kids-sparkle::after {
          width: 100%;
          height: 2px;
          opacity: 0.76;
        }

        @keyframes kids-sparkle-twinkle {
          0%,
          100% {
            transform: scale(0.74) rotate(0deg);
            opacity: 0.16;
          }
          28% {
            transform: scale(1.02) rotate(9deg);
            opacity: 0.72;
          }
          52% {
            transform: scale(0.84) rotate(15deg);
            opacity: 0.34;
          }
          74% {
            transform: scale(1.1) rotate(22deg);
            opacity: 0.9;
          }
        }
      `}</style>
    </div>
  );
}
