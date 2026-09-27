import { beforeEach, describe, expect, it, vi } from 'vitest';

const actor = '00000000-0000-0000-0000-000000000001';
const roomId = '00000000-0000-0000-0000-000000000002';
const code = '0123456789ABCDEF';
const mock = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInAnonymously: async () => ({ data: { user: { id: actor } }, error: null }),
    },
    functions: { invoke: mock.invoke },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        single: async () => ({ data: {
          id: roomId, invite_code: code, host_user_id: actor,
          status: 'waiting', max_players: 4, revision: 1,
          created_at: '2026-09-28T00:00:00Z',
        }, error: null }),
      };
      return {
        ...query,
        select: () => table === 'room_members' || table === 'room_events'
          ? {
            ...query,
            then: (resolve: (result: unknown) => void) => resolve({ data: [], error: null }),
          }
          : query,
      };
    },
  }),
}));

describe('Supabase room command recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    mock.invoke.mockReset();
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
  });

  it('reuses the same create action ID after two lost responses and a user retry', async () => {
    mock.invoke
      .mockResolvedValueOnce({ data: null, error: new Error('Network lost') })
      .mockResolvedValueOnce({ data: null, error: new Error('Network lost') })
      .mockResolvedValueOnce({ data: {
        roomId, inviteCode: code, revision: 1, status: 'waiting',
      }, error: null });
    const { createRoom } = await import('./supabaseRoom.ts');
    await expect(createRoom({ id: actor, name: 'Host' })).rejects.toThrow('Network lost');
    const recovered = await createRoom({ id: actor, name: 'Host' });
    expect(recovered.code).toBe(code);
    const IDs = mock.invoke.mock.calls.map((call) => call[1].body.actionId);
    expect(new Set(IDs).size).toBe(1);
    expect(IDs).toHaveLength(3);
  });
});
