'use client';

import type { ChatSession } from '@/lib/types/chat';
import type { Scene, Stage } from '@/lib/types/stage';
import { getSupabaseClient } from '@/lib/supabase/client';

export async function syncClassroomToSupabase(input: {
  stage: Stage;
  scenes: Scene[];
  chats: ChatSession[];
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return;

  const { stage, scenes, chats } = input;

  const payload = {
    id: stage.id,
    user_id: session.user.id,
    name: stage.name || 'Untitled Stage',
    description: stage.description ?? '',
    stage_data: stage,
    scenes_data: scenes,
    chats_data: chats,
  };

  const { error } = await supabase.from('classrooms').upsert(payload);
  if (error) {
    throw error;
  }
}
