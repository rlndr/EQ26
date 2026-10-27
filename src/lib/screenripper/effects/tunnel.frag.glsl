#version 300 es
// Kaleidoscope tunnel: screen position becomes (angle, depth) with depth = k / radius, so a
// pattern laid on the walls flies outwards from the centre. The angle is mirrored into wedges
// for the kaleidoscope, and twisted with depth so the tunnel spirals.
//
// Photosensitivity: rings pass any one pixel at 0.6 a second (SPEED, one ring per depth unit).
// The twist turns the walls at 0.15 × SPEED + 0.05 = 0.14 rad/s, which is 0.18 wedges a second
// and, at 3 diamonds per wedge, about 0.5 a second. Together about 1.1 Hz, well under 3 flashes
// a second.
//
// Near the centre depth changes so fast per pixel that the pattern would alias into shimmering
// noise, so it fades into darkness there, and lines are antialiased with fwidth to stay about a
// pixel wide at any depth.
precision highp float;

uniform vec2 uResolution;
uniform float uTime;

out vec4 outColor;

const float WEDGES = 8.0;
const float TAU = 6.28318;
/** Rings per unit depth and forward speed in depth units per second */
const float SPEED = 0.6;

vec3 palette(float x) {
  return 0.5 + 0.5 * cos(TAU * (x + vec3(0.0, 0.2, 0.45)));
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  // The tunnel's far end wanders a little, so it feels like flying rather than staring
  p += 0.08 * vec2(sin(uTime * 0.3), cos(uTime * 0.23));

  float r = max(length(p), 1e-4);
  float depth = 0.35 / r + uTime * SPEED;
  float a = atan(p.y, p.x) + depth * 0.15 + uTime * 0.05;

  // Mirror the angle into WEDGES wedges, each reflected, for the kaleidoscope
  float wedge = TAU / WEDGES;
  a = abs(mod(a, wedge) - 0.5 * wedge) / wedge;

  // Diamond lattice on the walls: |x| + |y| distance to the cell centre, outlined
  vec2 cell = fract(vec2(a * 3.0, depth)) - 0.5;
  float d = abs(cell.x) + abs(cell.y);
  float edge = abs(d - 0.32);
  float aa = fwidth(edge) + 1e-4;
  float line = 1.0 - smoothstep(0.0, 1.5 * aa + 0.02, edge);
  float fill = 0.25 * (1.0 - smoothstep(0.0, 0.32, d));

  // Dark at the far end (centre), bright towards the near walls (edges)
  float fog = smoothstep(0.04, 0.45, r);
  vec3 col = palette(depth * 0.04 + uTime * 0.02) * (line + fill) * fog;
  outColor = vec4(col, 1.0);
}
