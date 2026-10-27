#version 300 es
// Julia set for a constant c supplied by julia.ts, which moves c along the edge of the
// Mandelbrot set's main cardioid, swinging a little inside and outside it. Inside, the Julia set
// is one connected shape; outside, it breaks into dust; on the edge it is at its most intricate.
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uC;
uniform float uAngle;
uniform int uIter;

out vec4 outColor;

const int MAX_ITER = 400;
/** Height of the view in the complex plane */
const float VIEW = 3.0;

vec3 palette(float x) {
  return 0.5 + 0.5 * cos(6.28318 * (x + vec3(0.55, 0.35, 0.15)));
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float ca = cos(uAngle);
  float sa = sin(uAngle);
  vec2 z = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y) * VIEW;

  float mu = -1.0;
  for (int i = 0; i < MAX_ITER; i++) {
    if (i >= uIter) break;
    float xx = z.x * z.x;
    float yy = z.y * z.y;
    if (xx + yy > 256.0) {
      mu = float(i) + 1.0 - log2(log2(xx + yy) * 0.5);
      break;
    }
    z = vec2(xx - yy + uC.x, 2.0 * z.x * z.y + uC.y);
  }

  vec3 col;
  if (mu < 0.0) {
    // Inside: a dim tint from where the orbit ended, so the filled set is not a flat black hole
    col = 0.12 * palette(length(z) * 0.5 + uTime * 0.01);
  } else {
    col = palette(sqrt(mu) * 0.22 + uTime * 0.01);
  }
  outColor = vec4(col, 1.0);
}
