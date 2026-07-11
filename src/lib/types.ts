export type OutingFormat = 'stroke' | 'scramble'
export type HandicapMode = 'none' | 'manual' | 'auto'
export type OutingStatus = 'setup' | 'live' | 'final'

export interface Outing {
  id: string
  organizer_id: string
  course_id: string
  tee_id: string
  par_snapshot: number[]
  stroke_index_snapshot: number[] | null
  play_date: string
  format: OutingFormat
  skins_enabled: boolean
  handicap_mode: HandicapMode
  status: OutingStatus
  share_code: string
}

export interface Group {
  id: string
  outing_id: string
  name: string
  scorekeeper_user_id: string | null
}

export interface Player {
  id: string
  outing_id: string
  group_id: string
  display_name: string
  handicap_index: number | null
}
