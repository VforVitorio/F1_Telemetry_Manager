import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { LabSearch, ModelId } from '../search'

// The contract every model on the bench follows. Adding a seventh model is one
// registry entry: an identity (icon/title/model-type/eval headline), which
// context control it needs, and a ResultView that owns its run + verdict + viz.

/** Which context control the bar shows for a model. */
export type LabControl = 'window' | 'lap' | 'radio'

/** Props the bench passes to every model's ResultView: the current moment plus
 *  a URL patcher (for "jump to last valid lap" and "Send to Strategy"). The
 *  ResultView reads its own active run from the store and owns its run mutation. */
export interface ResultViewProps {
  gp?: string
  driver?: string
  lap?: number
  laps?: [number, number]
  onPatch: (patch: Partial<LabSearch>) => void
}

/** A model's identity, without its view, so a ResultView can export its own
 *  identity and the registry can build the rail from it without importing the
 *  view (which would import back, a cycle). */
export interface ModelMeta {
  id: ModelId
  Icon: LucideIcon
  /** Rail + run-header title, e.g. "Tyre degradation". */
  title: string
  /** Model-type chip, e.g. "TCN + MC-Dropout". */
  modelChip: string
  /** Headline evaluation metric from the IEEE report, e.g. "MAE 0.411 s". */
  evalHeadline: string
  /** One-line "what this model does", shown on the idle hero. */
  blurb: string
  control: LabControl
}

/** A model registry entry: its identity plus the view that runs it. */
export interface ModelDef extends ModelMeta {
  ResultView: ComponentType<ResultViewProps>
}
