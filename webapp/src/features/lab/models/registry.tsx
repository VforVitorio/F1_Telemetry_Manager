// The model registry: the six bench entries in rail order. Adding a model is
// one entry here. Overtake and Safety car share SituationResultView (one run,
// two lenses), so their entries wrap it with a fixed lens.

import type { ModelId } from '../search'
import type { ModelDef, ResultViewProps } from './types'
import { PACE_META, PaceResultView } from './PaceResultView'
import { TYRE_META, TyreResultView } from './TyreResultView'
import { OVERTAKE_META, SAFETYCAR_META, SituationResultView } from './SituationResultView'
import { PIT_META, PitResultView } from './PitResultView'
import { RADIO_META, RadioResultView } from './RadioResultView'

function OvertakeResultView(props: ResultViewProps) {
  return <SituationResultView {...props} lens="overtake" />
}
function SafetyCarResultView(props: ResultViewProps) {
  return <SituationResultView {...props} lens="safetycar" />
}

export const MODEL_DEFS: ModelDef[] = [
  { ...PACE_META, ResultView: PaceResultView },
  { ...TYRE_META, ResultView: TyreResultView },
  { ...OVERTAKE_META, ResultView: OvertakeResultView },
  { ...SAFETYCAR_META, ResultView: SafetyCarResultView },
  { ...PIT_META, ResultView: PitResultView },
  { ...RADIO_META, ResultView: RadioResultView },
]

export const MODEL_DEF_BY_ID = Object.fromEntries(MODEL_DEFS.map((d) => [d.id, d])) as Record<
  ModelId,
  ModelDef
>
