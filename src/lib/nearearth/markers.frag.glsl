#version 300 es
precision highp float;

in float vStrength;
in float vFlare;
in float vEnergy;
out vec4 outColor;

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r >= 1.0) discard;
  float core = smoothstep(0.32, 0.0, r);
  float glow = pow(1.0 - r, 1.6);

  vec3 ember = mix(vec3(0.98, 0.42, 0.09), vec3(1.0, 0.72, 0.28), vEnergy);
  vec3 white = vec3(1.0, 0.93, 0.74);
  vec3 color = mix(ember, white, clamp(vFlare + core * 0.3, 0.0, 1.0));

  float alpha = (glow * (0.55 + 0.45 * vFlare) + core * 0.6) * vStrength;
  outColor = vec4(color * alpha, alpha);
}
