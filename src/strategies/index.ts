import { BUILD_SCALP_FAST } from './build_scalp_fast'
import { BUILD_SCALP_FAST_ALTS } from './scalp_fast_alts'
import { BUILD_SCALP_FAST_INDICATORS } from './scalp_indicators'

const build_scalp_fast = new BUILD_SCALP_FAST()
const indicators = new BUILD_SCALP_FAST_INDICATORS()
const alts = new BUILD_SCALP_FAST_ALTS()

export default { build_scalp_fast, indicators, alts }
