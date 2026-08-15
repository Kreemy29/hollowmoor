import type { MinigameId } from '@/lib/types'
import type { GameProps } from './types'
import { BreathOfTheDeep } from './BreathOfTheDeep'
import { CravingCrusher } from './CravingCrusher'
import { FocusDelve } from './FocusDelve'
import { MemoryOfRestwick } from './MemoryOfRestwick'

const REGISTRY: Record<MinigameId, (props: GameProps) => JSX.Element> = {
  breath: BreathOfTheDeep,
  crusher: CravingCrusher,
  delve: FocusDelve,
  memory: MemoryOfRestwick,
}

export function GameHost({ id, ...props }: GameProps & { id: MinigameId }) {
  const Game = REGISTRY[id]
  return <Game {...props} />
}

export * from './types'
