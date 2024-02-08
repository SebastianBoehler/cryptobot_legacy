import { BUILD } from './build'
import { BUILD_FAST } from './build_fast'
import { BUILD_SCALP } from './build_scalp'
import { BUILD_SCALP_FAST } from './build_scalp_fast'
import { BUILD_SCALP_FAST_V2 } from './build_scalp_fast_v2'
import { SCALP_INDICATORS } from './scalp_indicators'

const build = new BUILD()
const build_fast = new BUILD_FAST()
const build_scalp = new BUILD_SCALP()
const build_scalp_fast = new BUILD_SCALP_FAST()
const scalp_indicators = new SCALP_INDICATORS()
const v2 = new BUILD_SCALP_FAST_V2()

export default { build, build_fast, build_scalp, build_scalp_fast, scalp_indicators, v2 }
