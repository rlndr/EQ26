#version 300 es
// Ray traces the Earth, its atmosphere and the aurora shell. Distances are in Earth radii.
// Vectors are Earth-fixed: x through (0N, 0E), y through the north pole, z through 90W.
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uTan;
uniform vec3 uCamPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;

uniform vec3 uSun;
uniform vec3 uMoon;
uniform float uMoonIllum;

uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uNoise;
uniform sampler2D uAuroraA;
uniform sampler2D uAuroraB;
uniform float uTexHeight;
uniform float uMix;

uniform float uShellScale;
uniform float uMinSinLat;
uniform int uSteps;

uniform vec3 uPole;
uniform vec3 uPoleU1;
uniform vec3 uPoleU2;

uniform float uGround;
uniform vec3 uGroundUp;
uniform vec3 uGroundNorth;
uniform vec3 uGroundEast;

uniform vec3 uPin;
uniform float uPinOn;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const float DEG = 57.2957795131;
const float R_KM = 6371.0;
const float SHELL_LOW_KM = 100.0;
const float SHELL_HIGH_KM = 300.0;

float hash11(float x) {
  return fract(sin(x * 127.1) * 43758.5453);
}

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

// Interleaved gradient noise: offsets each pixel's ray march so banding becomes fine grain
float interleaved(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

bool hitSphere(vec3 ro, vec3 d, float r, out float t0, out float t1) {
  float b = dot(ro, d);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) {
    t0 = -1.0;
    t1 = -1.0;
    return false;
  }
  h = sqrt(h);
  t0 = -b - h;
  t1 = -b + h;
  return t1 > 0.0;
}

float stars(vec3 d) {
  float sum = 0.0;
  for (int i = 0; i < 2; i++) {
    float scale = i == 0 ? 170.0 : 340.0;
    vec3 p = d * scale;
    vec3 cell = floor(p);
    float h = hash31(cell + float(i) * 7.0);
    if (h > 0.9965) {
      vec3 offset = hash33(cell) * 0.6 + 0.2;
      float dist = length(fract(p) - offset);
      float size = i == 0 ? 0.42 : 0.3;
      sum += smoothstep(size, 0.0, dist) * ((h - 0.9965) / 0.0035) * (i == 0 ? 1.2 : 0.7);
    }
  }
  return sum;
}

// A faint band of unresolved stars
vec3 milkyWay(vec3 d) {
  vec3 galacticPole = normalize(vec3(-0.45, 0.48, 0.75));
  float lat = dot(d, galacticPole);
  float band = exp(-lat * lat * 26.0);
  vec2 uv = vec2(atan(d.z, d.x) / TAU, asin(clamp(lat, -1.0, 1.0)) / PI);
  // A high mip level: at these fields of view the texture's own pixels would otherwise show
  float clouds = textureLod(uNoise, uv * vec2(1.0, 2.0), 3.0).g;
  return vec3(0.06, 0.065, 0.1) * band * smoothstep(0.32, 0.72, clouds);
}

vec3 earth(vec3 n, vec3 d, float t) {
  float lon = atan(-n.z, n.x);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  vec2 uv = vec2(lon / TAU + 0.5, 0.5 - lat / PI);

  // The mip level is worked out from the geometry rather than by the GPU: screen derivatives of
  // atan() jump at the 180 degree meridian and would draw a visible seam along it
  float facing = max(dot(n, -d), 0.12);
  float texel = PI / uTexHeight;
  float pixel = t * 2.0 * uTan.y / uResolution.y / facing;
  float lod = max(0.0, log2(pixel / texel));

  vec3 day = textureLod(uDay, uv, lod).rgb;
  vec3 night = textureLod(uNight, uv, lod).rgb;

  float sun = dot(n, uSun);
  float lit = smoothstep(-0.08, 0.16, sun);
  vec3 sunlit = day * (0.14 + 1.15 * clamp(sun, 0.0, 1.0));

  // The night map also shows deserts and ice in moonlight at about 30-40% grey. Only what rises
  // above that counts as city light, or the whole of the Sahara would glow.
  float city = max(night.r, max(night.g, night.b));
  float glow = max(city - 0.34, 0.0) / 0.66;
  vec3 lights = pow(glow, 1.2) * vec3(1.0, 0.8, 0.52) * 1.9;
  vec3 dark = day * vec3(0.05, 0.07, 0.12) + night * 0.05 + lights;

  vec3 color = mix(dark, sunlit, lit);

  // Warm band along the day-night line
  float dusk = exp(-sun * sun * 120.0);
  color += vec3(0.42, 0.14, 0.04) * dusk * 0.2;

  // Atmosphere thickening toward the limb
  float rim = pow(1.0 - max(dot(n, -d), 0.0), 3.5);
  color += mix(vec3(0.015, 0.03, 0.09), vec3(0.3, 0.55, 1.0), smoothstep(-0.25, 0.35, sun)) * rim * 0.9;
  return color;
}

vec3 atmosphereHalo(vec3 ro, vec3 d) {
  float along = -dot(ro, d);
  if (along < 0.0) return vec3(0.0);
  vec3 closest = ro + d * along;
  float b = length(closest);
  float glow = pow(clamp(1.0 - (b - 1.0) / 0.075, 0.0, 1.0), 3.2);
  vec3 n = closest / b;
  float sun = dot(n, uSun);
  vec3 air = mix(vec3(0.02, 0.05, 0.14), vec3(0.3, 0.58, 1.0), smoothstep(-0.3, 0.3, sun));
  air += vec3(0.7, 0.28, 0.08) * exp(-sun * sun * 45.0) * 0.5;
  return air * glow;
}

// The aurora grid at a direction from Earth's centre, already converted to brightness
float fieldAt(vec3 dir) {
  float lon = atan(-dir.z, dir.x) * DEG;
  if (lon < 0.0) lon += 360.0;
  float lat = asin(clamp(dir.y, -1.0, 1.0)) * DEG;
  vec2 uv = vec2((lon + 0.5) / 360.0, (lat + 90.5) / 181.0);
  return mix(textureLod(uAuroraA, uv, 0.0).r, textureLod(uAuroraB, uv, 0.0).r, uMix);
}

struct Curtain {
  float strength;
  float base;
};

// Everything here depends only on direction from Earth's centre. A point directly above another
// therefore gets the same value, which is what stretches the noise into vertical rays.
Curtain curtain(vec3 dir, float t) {
  float along = atan(dot(dir, uPoleU2), dot(dir, uPoleU1)) / TAU;
  float across = asin(clamp(dot(dir, uPole), -1.0, 1.0)) * DEG;

  // Sampled from high mip levels: the fine octaves here turn long arcs into fingerprint whorls
  float bend = textureLod(uNoise, vec2(along * 4.0 + t * 0.006, across * 0.012 + t * 0.002), 3.2).r;
  float fold = textureLod(uNoise, vec2(along * 19.0 - t * 0.014, across * 0.03), 2.4).g;
  float x = across * 0.42 + (bend - 0.5) * 7.0 + (fold - 0.5) * 2.2;

  float ribbon = 1.0 - abs(fract(x) - 0.5) * 2.0;
  ribbon = pow(ribbon, 3.0);

  vec4 patchy = textureLod(uNoise, vec2(along * 9.0 + t * 0.011, across * 0.05 - t * 0.004), 1.5);
  float presence = smoothstep(0.26, 0.68, patchy.b);

  float rayNoise = textureLod(uNoise, vec2(along * 210.0 + t * 0.035, across * 0.2 + t * 0.05), 0.0).a;
  float rays = 0.55 + 1.0 * rayNoise * rayNoise;

  Curtain c;
  c.strength = (0.4 + 1.5 * ribbon * presence) * rays;
  c.base = 0.02 + 0.2 * (1.0 - rayNoise) * (0.4 + 0.6 * bend);
  return c;
}

vec3 auroraColor(float h, float base) {
  vec3 green = vec3(0.2, 1.0, 0.48);
  vec3 red = vec3(0.95, 0.16, 0.26);
  vec3 violet = vec3(0.58, 0.2, 0.98);
  vec3 color = mix(green, red, smoothstep(0.42, 0.9, h));
  return mix(violet, color, smoothstep(base, base + 0.09, h));
}

vec3 aurora(vec3 ro, vec3 d, bool earthHit, float jitter) {
  float low = 1.0 + SHELL_LOW_KM * uShellScale / R_KM;
  float high = 1.0 + SHELL_HIGH_KM * uShellScale / R_KM;

  float tOuterNear, tOuterFar;
  if (!hitSphere(ro, d, high, tOuterNear, tOuterFar)) return vec3(0.0);

  float tInnerNear, tInnerFar;
  bool hitsInner = hitSphere(ro, d, low, tInnerNear, tInnerFar);

  float tStart, tEnd;
  if (length(ro) > low) {
    tStart = max(tOuterNear, 0.0);
    tEnd = tOuterFar;
    if (hitsInner && tInnerNear > 0.0 && earthHit) tEnd = tInnerNear;
  } else {
    if (earthHit) return vec3(0.0);
    tStart = tInnerFar;
    tEnd = tOuterFar;
  }
  if (tEnd <= tStart) return vec3(0.0);

  float span = tEnd - tStart;
  float dt = span / float(uSteps);
  float thickness = high - low;
  vec3 sum = vec3(0.0);

  for (int i = 0; i < uSteps; i++) {
    vec3 p = ro + d * (tStart + (float(i) + jitter) * dt);
    float r = length(p);
    if (r < low || r > high) continue;
    vec3 dir = p / r;
    if (abs(dir.y) < uMinSinLat) continue;

    float field = fieldAt(dir);
    if (field < 0.004) continue;

    float h = (r - low) / thickness;
    Curtain c = curtain(dir, uTime);
    float rise = smoothstep(c.base, c.base + 0.05, h);
    float profile = rise * exp(-(h - c.base) * 2.7);
    if (profile <= 0.0) continue;

    // Sunlight drowns the aurora out, so the day side only keeps a trace of it
    float daylight = 1.0 - 0.8 * smoothstep(-0.08, 0.2, dot(dir, uSun));
    sum += auroraColor(h, c.base) * field * c.strength * profile * daylight;
  }

  float gain = mix(5.5, 2.6, uGround);
  return 1.0 - exp(-sum * (dt / thickness) * gain);
}

vec3 groundSky(vec3 d) {
  float el = dot(d, uGroundUp);
  float sunSin = dot(uSun, uGroundUp);
  vec3 flatSun = normalize(uSun - uGroundUp * sunSin + 1e-5);
  vec3 flatD = normalize(d - uGroundUp * el + 1e-5);
  float toward = max(dot(flatD, flatSun), 0.0);
  float horizon = pow(1.0 - clamp(el, 0.0, 1.0), 7.0);

  vec3 night = vec3(0.008, 0.012, 0.03) + vec3(0.03, 0.04, 0.07) * horizon;

  float moonUp = smoothstep(-0.02, 0.1, dot(uMoon, uGroundUp));
  night += vec3(0.02, 0.03, 0.055) * uMoonIllum * moonUp;

  vec3 twilight = mix(vec3(0.04, 0.07, 0.2), vec3(0.95, 0.46, 0.2), horizon * (0.25 + 0.75 * toward));
  vec3 day = mix(vec3(0.62, 0.78, 1.0), vec3(0.16, 0.36, 0.82), sqrt(clamp(el, 0.0, 1.0)));

  float dusk = smoothstep(-0.32, -0.06, sunSin);
  float full = smoothstep(-0.05, 0.14, sunSin);
  vec3 sky = mix(mix(night, twilight, dusk), day, full);

  float darkness = 1.0 - clamp(dusk * 1.4, 0.0, 1.0);
  float moonGlow = moonUp * uMoonIllum * darkness;
  sky += (stars(d) + 0.0) * vec3(0.9, 0.95, 1.0) * darkness * (1.0 - 0.55 * moonGlow);
  sky += milkyWay(d) * darkness * (1.0 - 0.8 * moonGlow);

  // The Moon is drawn slightly larger than life so it reads on screen
  float moonCos = dot(d, uMoon);
  sky += vec3(0.95, 0.93, 0.85) * smoothstep(0.99992, 0.99996, moonCos) * (0.25 + 0.75 * uMoonIllum) * moonUp;
  sky += vec3(0.25, 0.27, 0.32) * pow(max(moonCos, 0.0), 500.0) * uMoonIllum * moonUp;
  return sky;
}

// Height of the skyline in radians at this azimuth: rolling hills with conifers along them
float skyline(float az) {
  float u = az / TAU;
  float hills = 0.03 + 0.06 * textureLod(uNoise, vec2(u * 2.0, 0.31), 0.0).r;
  float trees = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float count = layer == 0 ? 180.0 : 420.0;
    float cell = u * count;
    float id = floor(cell);
    float f = fract(cell);
    float h = (layer == 0 ? 0.05 : 0.026) * (0.45 + 0.55 * hash11(mod(id, count) + float(layer) * 31.0));
    float tooth = h * max(0.0, 1.0 - abs(f - 0.5) * 2.1);
    trees = max(trees, tooth);
  }
  return hills + trees;
}

vec3 pinMark(vec3 color, vec3 n, vec3 d, float t) {
  if (uPinOn < 0.5) return color;
  float angle = acos(clamp(dot(n, uPin), -1.0, 1.0));
  float pixel = t * 2.0 * uTan.y / uResolution.y / max(dot(n, -d), 0.2);
  float px = angle / pixel;
  vec3 brass = vec3(0.847, 0.71, 0.325);
  float dotMark = smoothstep(3.6, 2.4, px);
  float ring = smoothstep(1.6, 0.6, abs(px - 8.0));
  float pulseAt = fract(uTime * 0.45);
  float pulse = smoothstep(1.8, 0.4, abs(px - (8.0 + pulseAt * 20.0))) * (1.0 - pulseAt);
  color = mix(color, brass, max(dotMark, ring * 0.9));
  return color + brass * pulse * 0.7;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ro = uCamPos;
  vec3 d = normalize(uForward + uRight * ndc.x * uTan.x + uUp * ndc.y * uTan.y);

  float tNear, tFar;
  bool hit = hitSphere(ro, d, 1.0, tNear, tFar) && tNear > 0.0;

  vec3 color;
  if (hit) {
    vec3 n = normalize(ro + d * tNear);
    color = pinMark(earth(n, d, tNear), n, d, tNear);
  } else {
    float sunDim = 1.0 - smoothstep(0.86, 0.995, dot(d, uSun));
    color = (vec3(stars(d)) * vec3(0.9, 0.95, 1.0) + milkyWay(d)) * sunDim;
    color += atmosphereHalo(ro, d);
    color += vec3(1.0, 0.92, 0.75) * pow(max(dot(d, uSun), 0.0), 900.0) * 1.4;
  }

  if (uGround > 0.0) {
    color = mix(color, groundSky(d), uGround);
  }

  float jitter = interleaved(gl_FragCoord.xy);
  vec3 light = aurora(ro, d, hit, jitter);
  color += light;

  if (uGround > 0.0) {
    float el = asin(clamp(dot(d, uGroundUp), -1.0, 1.0));
    float az = atan(dot(d, uGroundEast), dot(d, uGroundNorth));
    float edge = 2.0 * uTan.y / uResolution.y;
    float solid = smoothstep(edge, -edge, el - skyline(az));
    // Aurora light caught on the snow below the treeline
    vec3 snow = vec3(0.012, 0.016, 0.03) + light * 0.1 * smoothstep(0.0, -0.18, el);
    color = mix(color, snow, solid * uGround);
  }

  color += (jitter - 0.5) / 255.0;
  outColor = vec4(color, 1.0);
}
