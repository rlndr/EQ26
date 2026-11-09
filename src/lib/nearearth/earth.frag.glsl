#version 300 es
// The Earth for the fireball globe: a dimmed day map, a soft light that follows the camera so the
// whole visible side stays readable, and an atmosphere. No city lights, deliberately: they look like
// fireballs, and every glow on this globe is meant to be one. Distances are in Earth radii.
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2 uResolution;
uniform vec2 uTan;
uniform vec3 uCamPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform sampler2D uDay;
uniform float uTexHeight;
uniform vec3 uPin;
uniform float uPinOn;
uniform float uTime;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float hash31(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

vec3 hash33(vec3 p) {
  return fract(sin(vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  )) * 43758.5453);
}

float stars(vec3 d) {
  vec3 p = d * 240.0;
  vec3 cell = floor(p);
  float h = hash31(cell);
  if (h < 0.9965) return 0.0;
  float dist = length(fract(p) - (hash33(cell) * 0.6 + 0.2));
  return smoothstep(0.36, 0.0, dist) * ((h - 0.9965) / 0.0035);
}

vec3 surface(vec3 n, vec3 d, float t, vec3 light) {
  float lon = atan(-n.z, n.x);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  vec2 uv = vec2(lon / TAU + 0.5, 0.5 - lat / PI);

  // Mip level from the geometry: screen derivatives of atan() jump at the 180 degree meridian
  float facing = max(dot(n, -d), 0.12);
  float pixel = t * 2.0 * uTan.y / uResolution.y / facing;
  float lod = max(0.0, log2(pixel / (PI / uTexHeight)));

  vec3 day = textureLod(uDay, uv, lod).rgb;

  // Blue-shifted and dim, so orange fireballs stand out against it
  float grey = dot(day, vec3(0.3, 0.55, 0.15));
  vec3 base = mix(vec3(grey), day, 0.45) * vec3(0.72, 0.82, 1.0);
  float shade = 0.3 + 0.7 * clamp(dot(n, light), 0.0, 1.0);

  vec3 color = base * shade * 0.5;
  float rim = pow(1.0 - max(dot(n, -d), 0.0), 3.5);
  return color + vec3(0.2, 0.42, 0.85) * rim * 0.8;
}

vec3 halo(vec3 ro, vec3 d) {
  float along = -dot(ro, d);
  if (along < 0.0) return vec3(0.0);
  float b = length(ro + d * along);
  return vec3(0.22, 0.45, 0.95) * pow(clamp(1.0 - (b - 1.0) / 0.07, 0.0, 1.0), 3.2);
}

vec3 selectionRing(vec3 color, vec3 n, vec3 d, float t) {
  if (uPinOn < 0.5) return color;
  float angle = acos(clamp(dot(n, uPin), -1.0, 1.0));
  float pixel = t * 2.0 * uTan.y / uResolution.y / max(dot(n, -d), 0.2);
  float px = angle / pixel;
  vec3 brass = vec3(0.847, 0.71, 0.325);
  float ring = smoothstep(1.6, 0.6, abs(px - 17.0));
  float pulseAt = fract(uTime * 0.45);
  float pulse = smoothstep(1.8, 0.4, abs(px - (17.0 + pulseAt * 22.0))) * (1.0 - pulseAt);
  return mix(color, brass, ring * 0.95) + brass * pulse * 0.6;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ro = uCamPos;
  vec3 d = normalize(uForward + uRight * ndc.x * uTan.x + uUp * ndc.y * uTan.y);

  float b = dot(ro, d);
  float h = b * b - (dot(ro, ro) - 1.0);
  vec3 color;
  if (h > 0.0 && -b - sqrt(h) > 0.0) {
    float t = -b - sqrt(h);
    vec3 n = normalize(ro + d * t);
    // Over the viewer's shoulder, so the side facing the camera is always lit
    vec3 light = normalize(ro + uUp * 1.6 - uRight * 1.2);
    color = selectionRing(surface(n, d, t, light), n, d, t);
  } else {
    color = vec3(stars(d)) * vec3(0.9, 0.95, 1.0) + halo(ro, d);
  }
  outColor = vec4(color, 1.0);
}
