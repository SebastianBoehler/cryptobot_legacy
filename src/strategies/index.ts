import { BUILD_FAST } from './build_fast'
import { BUILD_SCALP_FAST } from './build_scalp_fast'
import { BUILD_SCALP_FAST_BEAR } from './build_scalp_fast_bear'
import { SCALP_FAST_NEW } from './scalp_fast_new'
import { BUILD_SCALP_FAST_ALTS } from './scalp_fast_alts'
import { SCALP_FAST_TEST } from './scalp_fast_test'
import { BUILD_SCALP_FAST_INDICATORS } from './scalp_indicators'

const build_fast = new BUILD_FAST()
const build_scalp_fast = new BUILD_SCALP_FAST()
const scalp_fast_new = new SCALP_FAST_NEW()
const build_scalp_fast_bear = new BUILD_SCALP_FAST_BEAR()
const indicators = new BUILD_SCALP_FAST_INDICATORS()
const alts = new BUILD_SCALP_FAST_ALTS()
const test = new SCALP_FAST_TEST()

export default { build_fast, build_scalp_fast, indicators, alts, build_scalp_fast_bear, test, scalp_fast_new }
