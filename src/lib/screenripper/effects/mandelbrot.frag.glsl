#version 300 es
// Mandelbrot set with smooth (fractional escape count) colouring. The zoom, centre, rotation and
// iteration count come from mandelbrot.ts; this file only evaluates one view.
//
// The iteration is written in the same order as verify.ts's float32 emulation (xx, yy, then
// x² − y² + cx and 2xy + cy), so the measured zoom limit applies to this code.
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uCenter;
/** View height in the complex plane */
uniform float uScale;
uniform float uAngle;
uniform int uIter;
/** 0–1, for the fade in and out at each end of a dive */
uniform float uFade;

out vec4 outColor;

// Loop bound must be a constant in GLSL ES; uIter stops it earlier
const int MAX_ITER = 512;

vec3 palette(float x) {
  return 0.5 + 0.5 * cos(6.28318 * (x + vec3(0.0, 0.15, 0.32)));
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float ca = cos(uAngle);
  float sa = sin(uAngle);
  p = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
  vec2 c = uCenter + p * uScale;

  // Skip the two biggest interior regions outright: early in each dive they are most of the
  // screen and would otherwise run all uIter iterations for a black pixel
  float qx = c.x - 0.25;
  float q = qx * qx + c.y * c.y;
  bool inside = q * (q + qx) <= 0.25 * c.y * c.y || (c.x + 1.0) * (c.x + 1.0) + c.y * c.y <= 0.0625;

  float mu = -1.0;
  if (!inside) {
    vec2 z = vec2(0.0);
    for (int i = 0; i < MAX_ITER; i++) {
      if (i >= uIter) break;
      float xx = z.x * z.x;
      float yy = z.y * z.y;
      // Large escape radius keeps the smooth count accurate
      if (xx + yy > 256.0) {
        mu = float(i) + 1.0 - log2(log2(xx + yy) * 0.5);
        break;
      }
      z = vec2(xx - yy + c.x, 2.0 * z.x * z.y + c.y);
    }
  }

  // sqrt keeps the colour bands from crowding together as counts climb with zoom
  vec3 col = mu < 0.0 ? vec3(0.0) : palette(sqrt(mu) * 0.16 + uTime * 0.01);
  outColor = vec4(col * uFade, 1.0);
}
