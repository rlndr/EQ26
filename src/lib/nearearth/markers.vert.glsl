#version 300 es
// One point per fireball. Everything about playback is worked out here from uCursor, so the
// animation needs no buffer updates. The projection must match projectPoint() in aurora/camera.ts.
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in float aTime;
layout(location = 2) in float aEnergy;

uniform vec3 uCamPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec2 uTan;
uniform float uCursor;
uniform float uFlareWidth;
uniform float uMinEnergy;
uniform vec2 uRange;
uniform float uPixelScale;
uniform float uMaxPoint;

out float vStrength;
out float vFlare;
out float vEnergy;

void main() {
  float age = uCursor - aTime;
  // On a unit sphere, a surface point faces the camera when its dot with the camera exceeds 1
  float facing = dot(aPos, uCamPos);
  if (age < 0.0 || aTime < uRange.x || aTime > uRange.y || aEnergy < uMinEnergy || facing <= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vStrength = 0.0;
    vFlare = 0.0;
    vEnergy = 0.0;
    return;
  }

  vec3 v = aPos - uCamPos;
  float depth = dot(v, uForward);
  gl_Position = vec4(dot(v, uRight) / (depth * uTan.x), dot(v, uUp) / (depth * uTan.y), 0.0, 1.0);

  float flare = exp(-age / uFlareWidth);
  float ember = 9.0 + 34.0 * aEnergy * aEnergy;
  gl_PointSize = min((ember + flare * (26.0 + 40.0 * aEnergy)) * uPixelScale, uMaxPoint);

  // Fades in over the last few degrees before the limb instead of popping
  vStrength = smoothstep(1.0, 1.0 + 0.08 * length(uCamPos), facing);
  vFlare = flare;
  vEnergy = aEnergy;
}
