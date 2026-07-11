import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function newClient(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false } })
}

async function anonSession(): Promise<SupabaseClient> {
  const client = newClient()
  const { error } = await client.auth.signInAnonymously()
  if (error) throw error
  return client
}

describe('RLS permission matrix', () => {
  let organizer: SupabaseClient
  let scorekeeper: SupabaseClient
  let stranger: SupabaseClient
  let outingId: string
  let shareCode: string
  let groupId: string
  let playerId: string

  beforeAll(async () => {
    organizer = await anonSession()
    scorekeeper = await anonSession()
    stranger = await anonSession()

    const { data: course, error: cErr } = await organizer
      .from('courses')
      .insert({
        name: 'Test Muni',
        num_holes: 9,
        created_by: (await organizer.auth.getUser()).data.user!.id,
      })
      .select()
      .single()
    expect(cErr).toBeNull()

    const { data: tee, error: tErr } = await organizer
      .from('course_tees')
      .insert({ course_id: course!.id, name: 'White', par: [4, 4, 3, 5, 4, 4, 3, 5, 4] })
      .select()
      .single()
    expect(tErr).toBeNull()

    const { data: outing, error: oErr } = await organizer.rpc('create_outing', {
      p_course_id: course!.id,
      p_tee_id: tee!.id,
      p_play_date: '2026-07-11',
      p_format: 'stroke',
      p_skins: false,
      p_handicap_mode: 'none',
    })
    expect(oErr).toBeNull()
    outingId = outing!.id
    shareCode = outing!.share_code

    const { data: gid, error: gErr } = await scorekeeper.rpc('create_group', {
      p_share_code: shareCode,
      p_name: 'The Hackers',
      p_player_names: ['Alice', 'Bob'],
    })
    expect(gErr).toBeNull()
    groupId = gid!

    const { data: players } = await scorekeeper
      .from('players')
      .select()
      .eq('group_id', groupId)
    playerId = players![0].id
  })

  it('share code has 6 chars from the safe alphabet', () => {
    expect(shareCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('get_outing_by_code resolves for a stranger', async () => {
    const { data } = await stranger.rpc('get_outing_by_code', { p_code: shareCode.toLowerCase() })
    expect(data![0].id).toBe(outingId)
  })

  it('stranger can read groups/players (spectator)', async () => {
    const { data } = await stranger.from('players').select().eq('outing_id', outingId)
    expect(data!.length).toBe(2)
  })

  it('stranger cannot update the outing', async () => {
    await stranger.from('outings').update({ status: 'live' }).eq('id', outingId)
    const { data } = await stranger.from('outings').select('status').eq('id', outingId).single()
    expect(data!.status).toBe('setup')
  })

  it('organizer can update the outing', async () => {
    const { error } = await organizer.from('outings').update({ status: 'live' }).eq('id', outingId)
    expect(error).toBeNull()
    const { data } = await organizer.from('outings').select('status').eq('id', outingId).single()
    expect(data!.status).toBe('live')
  })

  it('scorekeeper can write a score for their own player', async () => {
    const uid = (await scorekeeper.auth.getUser()).data.user!.id
    const { error } = await scorekeeper.from('scores').insert({
      outing_id: outingId, hole_number: 1, strokes: 5, player_id: playerId, entered_by: uid,
    })
    expect(error).toBeNull()
  })

  it("stranger cannot write a score for someone else's player", async () => {
    const uid = (await stranger.auth.getUser()).data.user!.id
    const { error } = await stranger.from('scores').insert({
      outing_id: outingId, hole_number: 2, strokes: 4, player_id: playerId, entered_by: uid,
    })
    expect(error).not.toBeNull()
  })

  it('claim_group: already-claimed returns false', async () => {
    const { data: claimed } = await stranger.rpc('claim_group', { p_group_id: groupId })
    expect(claimed).toBe(false)
  })

  it('no writes after final', async () => {
    await organizer.from('outings').update({ status: 'final' }).eq('id', outingId)
    const uid = (await scorekeeper.auth.getUser()).data.user!.id
    const { error } = await scorekeeper.from('scores').insert({
      outing_id: outingId, hole_number: 3, strokes: 4, player_id: playerId, entered_by: uid,
    })
    expect(error).not.toBeNull()
  })
})
