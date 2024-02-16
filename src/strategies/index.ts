import { BUILD_FAST } from './build_fast'
import { BUILD_SCALP } from './build_scalp'
import { BUILD_SCALP_FAST } from './build_scalp_fast'
import { SCALP_INDICATORS } from './scalp_indicators'

const build_fast = new BUILD_FAST()
const build_scalp = new BUILD_SCALP()
const build_scalp_fast = new BUILD_SCALP_FAST()
const scalp_indicators = new SCALP_INDICATORS()

export default { build_fast, build_scalp, build_scalp_fast, scalp_indicators }
