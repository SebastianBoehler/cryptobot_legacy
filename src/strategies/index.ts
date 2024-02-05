import { BUILD } from './build'
import { BUILD_FAST } from './build_fast'
import { BUILD_SCALP } from './build_scalp'
import { BUILD_SCALP_FAST } from './build_scalp_fast'

const build = new BUILD()
const build_fast = new BUILD_FAST()
const build_scalp = new BUILD_SCALP()
const build_scalp_fast = new BUILD_SCALP_FAST()

export default { build, build_fast, build_scalp, build_scalp_fast }
