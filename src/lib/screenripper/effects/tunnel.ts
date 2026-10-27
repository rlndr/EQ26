import { fullscreenShader } from '../gl'
import FRAG from './tunnel.frag.glsl?raw'

export const tunnel = () => fullscreenShader({ frag: FRAG })
