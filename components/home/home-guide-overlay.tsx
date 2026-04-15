'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';

const TOP_INPUT_LINES = [
  'Write your classroom idea here and generate!',
  'Start with a topic and we build slides for you.',
  'Need help? Type any teaching goal to begin.',
  'This is your smart classroom creation box.',
];

const RECENTS_LINES = [
  'Your recent classrooms are listed here.',
  'Click any recent classroom to reopen instantly.',
  'Continue your previous lessons from this section.',
  'Use pagination below to browse more classrooms.',
];

export function HomeGuideOverlay() {
  const [topIdx, setTopIdx] = useState(0);
  const [recentIdx, setRecentIdx] = useState(0);

  useEffect(() => {
    const topTimer = window.setInterval(() => {
      setTopIdx((prev) => (prev + 1) % TOP_INPUT_LINES.length);
    }, 4300);

    const recentTimer = window.setInterval(() => {
      setRecentIdx((prev) => (prev + 1) % RECENTS_LINES.length);
    }, 5000);

    return () => {
      window.clearInterval(topTimer);
      window.clearInterval(recentTimer);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <motion.div
        className="absolute left-[4.5%] top-[7%] hidden lg:block"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="relative max-w-[250px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={`top-${topIdx}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.42, ease: 'easeOut' }}
              className="mb-1 rounded-2xl border border-pink-200/80 bg-white/92 px-3 py-2 text-[11px] font-semibold text-pink-700 shadow-[0_10px_24px_-16px_rgba(236,72,153,0.65)]"
            >
              {TOP_INPUT_LINES[topIdx]}
            </motion.div>
          </AnimatePresence>
          <div className="absolute left-8 top-full h-0 w-0 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-pink-200/90" />
        </div>
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [0, -1.5, 0] }}
          transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Image
            src="/images/characters/doll-happy-book.svg"
            alt="Guide character for home input"
            width={82}
            height={98}
            className="mt-2 opacity-90"
          />
        </motion.div>
      </motion.div>

      <motion.div
        className="absolute right-[3%] top-[66%] hidden xl:block"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="relative max-w-[250px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={`recent-${recentIdx}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.42, ease: 'easeOut' }}
              className="mb-1 rounded-2xl border border-blue-200/80 bg-white/92 px-3 py-2 text-[11px] font-semibold text-blue-700 shadow-[0_10px_24px_-16px_rgba(37,99,235,0.6)]"
            >
              {RECENTS_LINES[recentIdx]}
            </motion.div>
          </AnimatePresence>
          <div className="absolute right-8 top-full h-0 w-0 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-blue-200/90" />
        </div>
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [0, 1.4, 0] }}
          transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Image
            src="/images/characters/hero-excited-rocket.svg"
            alt="Guide character for recents"
            width={88}
            height={104}
            className="mt-2 opacity-90"
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
