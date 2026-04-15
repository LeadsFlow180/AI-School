'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

const TOP_BAR_LINES = [
  'Tap here for scene tools and quick actions!',
  'Use this bar to switch and control your lesson.',
  'Your class controls live right at the top.',
  'Teacher mode is ready. Let us learn together!',
];

const CHAT_LINES = [
  'Chat and Notes live on this side panel.',
  'Ask questions and continue class discussion here.',
  'Open Chat to interact with your class assistants.',
  'Notes help students follow the lesson clearly.',
];

export function KidsGuideOverlay({
  isNotesChatOpen = false,
  isSidebarOpen = false,
}: {
  isNotesChatOpen?: boolean;
  isSidebarOpen?: boolean;
}) {
  const [topLineIdx, setTopLineIdx] = useState(0);
  const [chatLineIdx, setChatLineIdx] = useState(0);

  useEffect(() => {
    const topTimer = window.setInterval(() => {
      setTopLineIdx((prev) => (prev + 1) % TOP_BAR_LINES.length);
    }, 4200);

    const chatTimer = window.setInterval(() => {
      setChatLineIdx((prev) => (prev + 1) % CHAT_LINES.length);
    }, 4800);

    return () => {
      window.clearInterval(topTimer);
      window.clearInterval(chatTimer);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {/* # Reason: Horizontal position is plain CSS — Motion-animated `left` still
          re-layouts each frame; fixed column width avoids bubble text reflow nudging
          the mascot; rotate uses origin-bottom so tilt does not read as sliding. */}
      <div
        className={cn(
          'absolute top-[5.8rem] hidden lg:block transition-[left] duration-300 ease-out',
          isSidebarOpen ? 'left-[22%]' : 'left-[15%]',
        )}
      >
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="relative w-[260px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={`class-top-${topLineIdx}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.42, ease: 'easeOut' }}
                className="mb-1 rounded-2xl border border-pink-200/80 bg-white/92 px-3 py-2 text-[11px] font-semibold text-pink-700 shadow-[0_10px_24px_-16px_rgba(236,72,153,0.65)]"
              >
                {TOP_BAR_LINES[topLineIdx]}
              </motion.div>
            </AnimatePresence>
            <div className="absolute left-8 top-full h-0 w-0 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-pink-200/90" />
          </div>
          <motion.div
            className="origin-bottom will-change-transform"
            animate={{ rotate: [0, -1.5, 0] }}
            transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Image
              src="/images/characters/doll-thinking-pencil.svg"
              alt="Guide character for top bar"
              width={58}
              height={70}
              className="mt-1 opacity-85"
            />
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        className="absolute right-3 hidden xl:block"
        animate={{
          top: isNotesChatOpen ? '66%' : '20%',
          x: isNotesChatOpen ? -8 : 0,
          scale: isNotesChatOpen ? 0.94 : 1,
        }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        <div className="relative max-w-[260px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={`class-chat-${chatLineIdx}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.42, ease: 'easeOut' }}
              className="mb-1 rounded-2xl border border-blue-200/80 bg-white/92 px-3 py-2 text-[11px] font-semibold text-blue-700 shadow-[0_10px_24px_-16px_rgba(37,99,235,0.6)]"
            >
              {CHAT_LINES[chatLineIdx]}
            </motion.div>
          </AnimatePresence>
          <div className="absolute right-10 top-full h-0 w-0 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-blue-200/90" />
        </div>
        <motion.div
          animate={
            isNotesChatOpen
              ? { y: [0, -8, 0], rotate: [0, 2.4, 0], scale: [1, 1.04, 1] }
              : { y: [0, -5, 0], rotate: [0, 1.4, 0], scale: [1, 1, 1] }
          }
          transition={{ duration: isNotesChatOpen ? 3.8 : 5.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Image
            src="/images/characters/hero-thinking-globe.svg"
            alt="Guide character for chat area"
            width={74}
            height={86}
            className="mt-2 opacity-90"
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
