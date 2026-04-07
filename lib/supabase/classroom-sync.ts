'use client';

import type { ChatSession } from '@/lib/types/chat';
import type { Scene, Stage } from '@/lib/types/stage';
import { getSupabaseClient } from '@/lib/supabase/client';

const SESSION_RETRY_DELAYS_MS = [0, 150, 400];

async function resolveSessionUserId() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { supabase: null, userId: null };
  }

  for (const delay of SESSION_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user?.id) {
      return { supabase, userId: session.user.id };
    }
  }

  return { supabase, userId: null };
}

export async function syncClassroomToSupabase(input: {
  stage: Stage;
  scenes: Scene[];
  chats: ChatSession[];
}) {
  const { supabase, userId } = await resolveSessionUserId();
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }
  if (!userId) {
    throw new Error('No active authenticated session found for classroom sync.');
  }

  const { stage, scenes, chats } = input;

  const payload = {
    id: stage.id,
    user_id: userId,
    name: stage.name || 'Untitled Stage',
    description: stage.description ?? '',
    stage_data: stage,
    scenes_data: scenes,
    chats_data: chats,
  };

  const { error } = await supabase.from('classrooms').upsert(payload, { onConflict: 'id' });
  if (error) {
    throw error;
  }

  console.info(`[ClassroomSync] Synced classroom ${stage.id} to Supabase for user ${userId}.`);
}
