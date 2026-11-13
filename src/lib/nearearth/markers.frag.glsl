#version 300 es
precision highp float;

in float vStrength;
in float vFlare;
in float vEnergy;
// 0: ember orange to amber by energy. 1: earthquake band colours, BAND_COLORS in src/lib/process.ts
uniform float uPalette;
out vec4 outColor;

// Earthquake markers carry (mag - 5) / 3. The bands match getMagnitudeBand(); the small allowance
// keeps a whole magnitude in its own band despite float rounding.
vec3 bandColor(float level) {
  float mag = 5.0 + 3.0 * level + 0.005;
  if (mag >= 8.0) return vec3(0.659, 0.333, 0.969); // M8+  #a855f7
  if (mag >= 7.0) return vec3(0.937, 0.267, 0.267); // M7.x #ef4444
  if (mag >= 6.0) return vec3(0.976, 0.451, 0.086); // M6.x #f97316
  return vec3(0.961, 0.620, 0.043);                 // M5.x #f59e0b
}

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r >= 1.0) discard;
  float core = smoothstep(0.32, 0.0, r);
  float glow = pow(1.0 - r, 1.6);

  vec3 ember = mix(vec3(0.98, 0.42, 0.09), vec3(1.0, 0.72, 0.28), vEnergy);
  vec3 white = vec3(1.0, 0.93, 0.74);
  vec3 base = uPalette > 0.5 ? bandColor(vEnergy) : ember;
  vec3 color = mix(base, white, clamp(vFlare + core * 0.3, 0.0, 1.0));

  float alpha = (glow * (0.55 + 0.45 * vFlare) + core * 0.6) * vStrength;
  outColor = vec4(color * alpha, alpha);
}
