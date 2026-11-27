/**
 * Live, generative backdrops for the focus room. One fragment shader, six scenes (SCENE uniform).
 * Everything is procedural: no images, no video, nothing to download.
 */
export const SCENES = [
  { id: "deep", name: "Deep Work", line: "Flowing lines. Bach.", track: "prelude" },
  { id: "noir", name: "Noir Night", line: "Rain on the window. Jazz.", track: "noir" },
  { id: "dusk", name: "Lo-fi Dusk", line: "Sunset hills. Lo-fi beats.", track: "lofi" },
  { id: "rain", name: "Rainy Desk", line: "Grey rain. Soft piano.", track: "rain" },
  { id: "ocean", name: "Ocean", line: "Sunlit water. Slow swells.", track: "waves" },
  { id: "fire", name: "Fireside", line: "Rising embers. A warm fire.", track: "hearth" },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

export const VERTEX = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

export const FRAGMENT = /* glsl */ `
precision highp float;
uniform vec2 R;
uniform float T;
uniform float SCENE;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }

float caustic(vec2 uv, float time){
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0; vec2 i = p; float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / 0.005), p.y / (cos(i.y + t) / 0.005)));
  }
  c = 1.17 - pow(c / 4.0, 1.4);
  return pow(abs(c), 8.0);
}

// 0. Deep Work: a field of fine lines rolling like silk.
vec3 deepWork(vec2 q, float t){
  vec3 col = mix(vec3(0.02, 0.03, 0.07), vec3(0.03, 0.10, 0.12), smoothstep(-0.6, 0.6, q.y));
  for (int k = 0; k < 36; k++) {
    float fk = float(k) / 36.0;
    float y = -0.30 + fk * 0.55 + (fbm(vec2(q.x * 1.3 + t * 0.05, fk * 2.0 + t * 0.03)) - 0.5) * 0.55
              + sin(q.x * 2.2 + t * 0.2 + fk * 3.0) * 0.06;
    float d = abs(q.y - y);
    float line = smoothstep(0.004, 0.0, d) * 0.8 + exp(-d * 90.0) * 0.16;
    vec3 tint = mix(vec3(0.47, 0.80, 0.73), vec3(0.89, 0.70, 0.42), smoothstep(-0.6, 0.7, q.x + fk * 0.4));
    col += tint * line * (0.25 + 0.75 * fk);
  }
  return col;
}

// 1. Noir Night: city lights blurred behind a rain-streaked window.
vec3 noirNight(vec2 q, float t){
  vec3 col = mix(vec3(0.015, 0.02, 0.05), vec3(0.04, 0.05, 0.10), smoothstep(-0.6, 0.5, q.y));
  for (int k = 0; k < 28; k++) {
    float fk = float(k);
    vec2 c = vec2(hash(vec2(fk, 1.0)) * 2.0 - 1.0, hash(vec2(fk, 2.0)) * 1.0 - 0.55) * vec2(R.x / R.y, 1.0) * 0.6;
    c.x += sin(t * 0.03 + fk) * 0.02;
    float r = 0.06 + hash(vec2(fk, 3.0)) * 0.13;
    float b = smoothstep(r, r * 0.55, length(q - c));
    float h = hash(vec2(fk, 4.0));
    vec3 lc = h < 0.45 ? vec3(1.0, 0.68, 0.32) : (h < 0.75 ? vec3(0.35, 0.75, 0.80) : vec3(0.95, 0.30, 0.30));
    col += lc * b * (0.22 + 0.18 * sin(t * 0.4 + fk));
  }
  // rain streaks on the glass
  vec2 g = q * vec2(38.0, 3.0); g.y += t * 0.9;
  vec2 id = floor(g); float rnd = hash(id);
  float streak = smoothstep(0.06, 0.0, abs(fract(g.x) - 0.5) - 0.0) * step(0.86, rnd) * smoothstep(0.0, 1.0, fract(g.y + rnd));
  col += vec3(0.6, 0.7, 0.8) * streak * 0.18;
  // beaded drops
  vec2 d2 = q * 14.0; vec2 di = floor(d2);
  float dr = hash(di + 7.0);
  float drop = smoothstep(0.12, 0.05, length(fract(d2) - 0.5 + (vec2(hash(di), hash(di + 3.0)) - 0.5) * 0.4)) * step(0.82, dr);
  col += vec3(0.8, 0.85, 0.9) * drop * 0.22;
  return col * 1.15;
}

// 2. Lo-fi Dusk: a sunset over rolling hills, stars coming out.
vec3 dusk(vec2 q, float t){
  float y = q.y;
  vec3 sky = mix(vec3(0.98, 0.62, 0.45), vec3(0.55, 0.32, 0.55), smoothstep(-0.05, 0.25, y));
  sky = mix(sky, vec3(0.10, 0.10, 0.25), smoothstep(0.2, 0.55, y));
  vec2 sunC = vec2(0.25, -0.02);
  sky += vec3(1.0, 0.82, 0.55) * smoothstep(0.13, 0.11, length(q - sunC)) * 0.9 + vec3(1.0, 0.6, 0.4) * exp(-length(q - sunC) * 5.0) * 0.4;
  // Stars: a soft round point per lucky cell (resolution-independent, so no blocky pixels).
  vec2 sg = q * 60.0; vec2 sid = floor(sg);
  float sr = hash(sid);
  vec2 sp = vec2(hash(sid + 1.7), hash(sid + 4.3)) * 0.6 + 0.2;
  float star = step(0.93, sr) * smoothstep(0.06, 0.0, length(fract(sg) - sp)) * smoothstep(0.15, 0.5, y)
               * (0.55 + 0.45 * sin(t * 1.5 + sr * 40.0));
  sky += star * 0.8;
  sky += vec3(0.9, 0.7, 0.8) * smoothstep(0.55, 0.75, fbm(vec2(q.x * 2.0 + t * 0.01, y * 6.0))) * smoothstep(0.0, 0.3, y) * 0.15;
  vec3 col = sky;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float h = -0.12 - fk * 0.09 + (fbm(vec2(q.x * (1.2 + fk * 0.5) + fk * 7.0 + t * 0.004 * (fk + 1.0), fk)) - 0.5) * 0.25;
    vec3 hill = mix(vec3(0.35, 0.20, 0.35), vec3(0.05, 0.04, 0.10), fk / 3.0);
    col = mix(col, hill, smoothstep(h + 0.004, h - 0.004, y));
  }
  return col;
}

// 3. Rainy Desk: slate rain falling through fog.
vec3 rainy(vec2 q, float t){
  vec3 col = mix(vec3(0.02, 0.04, 0.07), vec3(0.10, 0.18, 0.26), smoothstep(-0.7, 0.7, q.y));
  col += vec3(0.25, 0.35, 0.45) * fbm(q * 2.0 + vec2(t * 0.02, 0.0)) * 0.3;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 g = (q + vec2(q.y * 0.12, 0.0)) * vec2(60.0 - fk * 15.0, 2.0 + fk);
    g.y += t * (2.2 - fk * 0.5);
    vec2 id = floor(g); float rnd = hash(id + fk * 10.0);
    float streak = smoothstep(0.08, 0.0, abs(fract(g.x) - 0.5)) * step(0.8, rnd) * smoothstep(0.0, 0.7, fract(g.y + rnd));
    col += vec3(0.7, 0.78, 0.85) * streak * (0.16 - fk * 0.035);
  }
  float lamp = exp(-length(q - vec2(-0.6, -0.35)) * 2.6);
  col += vec3(1.0, 0.72, 0.40) * lamp * 0.55;
  col += vec3(1.0, 0.85, 0.6) * exp(-length(q - vec2(-0.6, -0.35)) * 14.0) * 0.5;
  return col;
}

// 4. Ocean: sunlight through the surface (the hero's water).
vec3 ocean(vec2 q, float t){
  vec2 sun = vec2(0.08 * sin(t * 0.05), 0.72);
  float d = length(q - sun);
  float depth = smoothstep(-0.55, 0.62, q.y);
  vec3 col = mix(vec3(0.008, 0.035, 0.055), vec3(0.015, 0.22, 0.27), smoothstep(0.0, 0.55, depth));
  col = mix(col, vec3(0.08, 0.66, 0.68), smoothstep(0.55, 1.0, depth) * 0.7);
  col += vec3(1.0, 0.78, 0.45) * exp(-d * 4.6) * 0.75;
  vec2 v = q - sun; float ang = atan(v.x, -v.y);
  float rays = pow(noise(vec2(ang * 9.0 + t * 0.07, 1.3)), 3.0) + pow(noise(vec2(ang * 17.0 - t * 0.05, 7.1)), 4.0) * 0.8;
  col += vec3(0.5, 0.9, 0.82) * rays * smoothstep(1.6, 0.0, length(v)) * 0.42;
  if (q.y > 0.3) {
    float h = q.y - 0.28; vec2 plane = vec2(q.x / h, 1.0 / h) * 0.22;
    col += vec3(0.6, 1.0, 0.92) * caustic(plane * 0.9 + vec2(0.0, t * 0.02), t * 0.28) * smoothstep(0.0, 0.22, q.y - 0.3) * 0.75;
  }
  return col * 1.3;
}

// 5. Fireside: embers rising over a warm glow.
vec3 fireside(vec2 q, float t){
  vec3 col = mix(vec3(0.03, 0.015, 0.01), vec3(0.06, 0.03, 0.03), smoothstep(-0.6, 0.6, q.y));
  float flick = 0.85 + 0.15 * noise(vec2(t * 3.0, 0.0));
  col += vec3(1.0, 0.45, 0.12) * exp(-length(q - vec2(0.0, -0.75)) * 1.6) * 1.1 * flick;
  col += vec3(0.5, 0.22, 0.10) * fbm(q * 2.5 + vec2(0.0, -t * 0.15)) * smoothstep(0.6, -0.6, q.y) * 0.5;
  col += vec3(1.0, 0.7, 0.3) * exp(-length(q - vec2(0.0, -0.8)) * 6.0) * 0.6 * flick;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 g = q * (9.0 + fk * 6.0) + vec2(sin(q.y * 4.0 + t + fk) * 0.6, -t * (0.6 + fk * 0.25));
    vec2 id = floor(g), f = fract(g) - 0.5;
    float rnd = hash(id + fk * 31.0);
    if (rnd > 0.72) {
      vec2 o = vec2(hash(id + 2.0), hash(id + 5.0)) - 0.5;
      float e = smoothstep(0.11, 0.0, length(f - o * 0.6));
      float life = smoothstep(0.7, -0.6, q.y);
      col += mix(vec3(1.0, 0.75, 0.35), vec3(1.0, 0.35, 0.1), rnd) * e * life * (1.2 - fk * 0.3);
    }
  }
  return col;
}

void main(){
  vec2 q = (gl_FragCoord.xy - 0.5 * R) / R.y;
  float t = T;
  vec3 col;
  if (SCENE < 0.5) col = deepWork(q, t);
  else if (SCENE < 1.5) col = noirNight(q, t);
  else if (SCENE < 2.5) col = dusk(q, t);
  else if (SCENE < 3.5) col = rainy(q, t);
  else if (SCENE < 4.5) col = ocean(q, t);
  else col = fireside(q, t);
  col = col / (1.0 + col * 0.45);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.2);
  col *= mix(0.55, 1.0, smoothstep(1.3, 0.3, length(q * vec2(0.8, 1.0))));
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) * 0.012;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;
