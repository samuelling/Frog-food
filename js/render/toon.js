// FrogFood's look: soft cel shading with painterly colour noise, Ghibli-ish rim light and backlit leaf glow,
// plus a few realistic touches (wet specular on frog skin, droplet lenses, glass). One light: the LED bar on
// the lid (the sun), plus a sky/ground ambient. All materials honour scene fog and logarithmic depth.
import * as THREE from '../vendor/three.module.min.js';

export const LIGHT = {
  sunDir: { value: new THREE.Vector3(0.25, 1, 0.15).normalize() },
  sunCol: { value: new THREE.Color('#fff1d0') },
  skyCol: { value: new THREE.Color('#7fb3a0') },
  groundCol: { value: new THREE.Color('#3a3220') },
  rimCol: { value: new THREE.Color('#fff4c8') },
  time: { value: 0 },
  wind: { value: new THREE.Vector2(0.28, -1).normalize() },
};

const VERT = /* glsl */`
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
uniform float uTime, uSway;
#ifdef USE_SWAY
attribute float aSway;
#endif
varying vec3 vWN; varying vec3 vWorld; varying vec2 vUv; varying float vH;
void main() {
  #include <color_vertex>
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  vH = position.y;
  #ifdef USE_SWAY
    // wind-stirred foliage: aSway (0 at the root, 1 at the tip) scales the displacement
    vec3 base = modelMatrix[3].xyz;
    #ifdef USE_INSTANCING
      base += instanceMatrix[3].xyz;
    #endif
    float ph = dot(base + position * 0.02, vec3(0.031, 0.0, 0.017));
    vec3 swayW = vec3(sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25, 0.0, cos(uTime * 1.1 + ph * 1.3) * 0.4);
    #ifdef USE_INSTANCING
      swayW = inverse(mat3(instanceMatrix)) * swayW;
    #endif
    transformed += uSway * aSway * swayW;
  #endif
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
  vec3 n = objectNormal;
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    n = mat3(instanceMatrix) * n; wp = instanceMatrix * wp;
  #endif
  vWN = normalize(mat3(modelMatrix) * n);
  vWorld = (modelMatrix * wp).xyz;
  vUv = uv;
}`;

const FRAG = /* glsl */`
#include <common>
#include <color_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor, sunDir, sunCol, skyCol, groundCol, rimCol, uTransCol;
uniform float uRim, uSpec, uShin, uTrans, uNoise, uNoiseScale, uOpacity, uLight, uEmit, uWet;
#ifdef USE_TMAP
uniform sampler2D uMap;
#endif
varying vec3 vWN; varying vec3 vWorld; varying vec2 vUv; varying float vH;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main() {
  #include <logdepthbuf_fragment>
  vec3 base = uColor;
  #ifdef USE_TMAP
    base *= texture2D(uMap, vUv).rgb;
  #endif
  #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR_ALPHA )
    base *= vColor.rgb;
  #endif
  // painterly: low-frequency colour wash and brush-scale grain, in world space
  float wash = vnoise(vWorld * uNoiseScale) * 0.65 + vnoise(vWorld * uNoiseScale * 4.1) * 0.35;
  base *= 1.0 + uNoise * (wash - 0.5);
  vec3 N = normalize(vWN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float ndl = dot(N, sunDir);
  // soft cel ramp: shadow, mid, lit
  float lit = smoothstep(-0.08, 0.06, ndl) * 0.55 + smoothstep(0.42, 0.56, ndl) * 0.45;
  vec3 amb = mix(groundCol, skyCol, N.y * 0.5 + 0.5);
  vec3 col = base * (amb * 1.0 + sunCol * lit * uLight);
  // backlit translucency (leaves, frog toe webbing): light coming through towards the viewer
  float back = pow(max(dot(-V, sunDir), 0.0), 2.0) * smoothstep(0.2, -0.4, ndl);
  col += uTransCol * base * uTrans * back * 2.2 * uLight;
  // rim halo
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += rimCol * rim * uRim * (0.35 + 0.65 * lit) * (0.3 + 0.7 * uLight);
  // wet specular: a sharp, slightly stylised highlight
  vec3 H = normalize(sunDir + V);
  float sp = pow(max(dot(N, H), 0.0), uShin);
  sp = mix(sp, smoothstep(0.35, 0.45, sp), uWet);
  col += sunCol * sp * uSpec * (0.25 + 0.75 * uLight);
  col += base * uEmit;
  gl_FragColor = vec4(col, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** opts: color, map, rim, spec, shin, trans, transCol, noise, noiseScale, sway, opacity, side, vertexColors, wet, emit */
export function toon(opts = {}) {
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uColor: { value: new THREE.Color(opts.color ?? '#ffffff') },
    uTransCol: { value: new THREE.Color(opts.transCol ?? '#c8ff7a') },
    uRim: { value: opts.rim ?? 0.35 }, uSpec: { value: opts.spec ?? 0 }, uShin: { value: opts.shin ?? 40 },
    uTrans: { value: opts.trans ?? 0 }, uNoise: { value: opts.noise ?? 0.25 }, uNoiseScale: { value: opts.noiseScale ?? 0.25 },
    uOpacity: { value: opts.opacity ?? 1 }, uSway: { value: opts.sway ?? 0 }, uEmit: { value: opts.emit ?? 0 }, uWet: { value: opts.wet ?? 0.6 },
    uMap: { value: opts.map || null },
  }]);
  // shared lighting uniforms by reference
  Object.assign(u, { sunDir: LIGHT.sunDir, sunCol: LIGHT.sunCol, skyCol: LIGHT.skyCol, groundCol: LIGHT.groundCol, rimCol: LIGHT.rimCol, uTime: LIGHT.time, uLight: TOON_LIGHT });
  if (opts.map) u.uMap.value = opts.map;
  const m = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: VERT, fragmentShader: FRAG, fog: true, lights: false,
    vertexColors: !!opts.vertexColors, transparent: (opts.opacity ?? 1) < 1 || !!opts.transparent, side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? true,
  });
  m.defines = {};
  if (opts.map) m.defines.USE_TMAP = '';
  if (opts.sway) m.defines.USE_SWAY = '';
  m.extensions = {};
  return m;
}
export const TOON_LIGHT = { value: 1 };

// ink outline: back faces pushed out along the normal, width growing slowly with distance (so silhouettes
// stay visible far away without becoming bold up close)
const OVERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
uniform float uWidth, uMax;
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  float d = -mvPosition.z;
  mvPosition.xyz += normalize(transformedNormal) * min(uWidth * (0.6 + d * 0.02), uMax);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const OFRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform vec3 uInk; uniform float uAlpha;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(uInk, uAlpha);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
export function outline(opts = {}) {
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uInk: { value: new THREE.Color(opts.color ?? '#1d1a12') }, uWidth: { value: opts.width ?? 0.04 }, uMax: { value: opts.max ?? 1.5 }, uAlpha: { value: opts.alpha ?? 0.9 } }]);
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: OVERT, fragmentShader: OFRAG, side: THREE.BackSide, fog: true, transparent: (opts.alpha ?? 0.9) < 1, depthWrite: true });
}
/** add an outline shell to a mesh (works for InstancedMesh too) */
export function inked(mesh, opts) {
  const o = mesh.isInstancedMesh ? new THREE.InstancedMesh(mesh.geometry, outline(opts), mesh.count) : new THREE.Mesh(mesh.geometry, outline(opts));
  if (mesh.isInstancedMesh) { o.instanceMatrix = mesh.instanceMatrix; o.count = mesh.count; o.frustumCulled = mesh.frustumCulled; }
  o.renderOrder = mesh.renderOrder; o.userData.outlineOf = mesh;
  mesh.add(o);
  if (!mesh.isInstancedMesh) { /* child inherits transform */ } else { o.matrixAutoUpdate = false; o.matrix.identity(); }
  return o;
}

// droplets: little lenses. Fresnel edge, a sharp highlight, a bright caustic opposite it, the world tinted
// and upside-down-ish through the middle (faked with the ground colour)
const DVERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
varying vec3 vWN; varying vec3 vWorld; varying vec3 vC;
void main() {
  #include <beginnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
  vec3 n = objectNormal; vec4 wp = vec4(transformed, 1.0); vec3 c = vec3(0.0);
  #ifdef USE_INSTANCING
    n = mat3(instanceMatrix) * n; wp = instanceMatrix * wp; c = instanceMatrix[3].xyz;
  #endif
  vWN = normalize(mat3(modelMatrix) * n); vWorld = (modelMatrix * wp).xyz; vC = (modelMatrix * vec4(c, 1.0)).xyz;
}`;
const DFRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform vec3 sunDir, sunCol, skyCol, groundCol; uniform float uLight;
varying vec3 vWN; varying vec3 vWorld; varying vec3 vC;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vWN), V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  // through the drop: the inverted world (sky below, ground above), sharpened
  vec3 R = refract(-V, N, 0.75);
  vec3 through = mix(skyCol * 1.3, groundCol * 1.4, smoothstep(-0.4, 0.4, R.y));
  vec3 refl = mix(groundCol, skyCol * 1.5, N.y * 0.5 + 0.5);
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 220.0) * 6.0;
  float caustic = pow(max(dot(-N, sunDir), 0.0), 6.0) * 1.6;
  vec3 col = mix(through * (0.7 + 0.3 * uLight), refl, fres) + sunCol * (spec + caustic * 0.5) * (0.3 + 0.7 * uLight);
  float a = mix(0.45, 0.95, fres) + spec;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
export function dropletMaterial() {
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  Object.assign(u, { sunDir: LIGHT.sunDir, sunCol: LIGHT.sunCol, skyCol: LIGHT.skyCol, groundCol: LIGHT.groundCol, uLight: TOON_LIGHT });
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: DVERT, fragmentShader: DFRAG, fog: true, transparent: true, depthWrite: false });
}

// water surfaces (the pond, the bromeliad cups): fresnel, moving glints
const WFRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform vec3 sunDir, sunCol, skyCol, groundCol; uniform float uLight, uTime;
varying vec3 vWN; varying vec3 vWorld; varying vec3 vC;
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vWorld.xz;
  vec3 N = normalize(vec3(sin(p.x * 0.9 + uTime * 0.7) * 0.05 + sin(p.y * 1.3 - uTime) * 0.04, 1.0, cos(p.y * 0.8 + uTime * 0.6) * 0.05 + sin(p.x * 1.7 + uTime * 1.2) * 0.03));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 deep = groundCol * 0.6 + vec3(0.02, 0.06, 0.05);
  vec3 col = mix(deep, skyCol * 1.4, fres);
  float spec = pow(max(dot(reflect(-V, N), sunDir), 0.0), 300.0) * 4.0;
  col += sunCol * spec * uLight;
  gl_FragColor = vec4(col, 0.72 + 0.28 * fres);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
export function waterMaterial() {
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  Object.assign(u, { sunDir: LIGHT.sunDir, sunCol: LIGHT.sunCol, skyCol: LIGHT.skyCol, groundCol: LIGHT.groundCol, uLight: TOON_LIGHT, uTime: LIGHT.time });
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: DVERT, fragmentShader: WFRAG, fog: true, transparent: true, depthWrite: false });
}

// light shafts from the LED bar: additive, soft-edged, slowly drifting
const SVERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWN; varying vec3 vWorld; varying float vY;
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  vWN = normalize(mat3(modelMatrix) * normal); vWorld = (modelMatrix * vec4(position, 1.0)).xyz; vY = uv.y;
}`;
const SFRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCol; uniform float uAlpha, uTime, uLight;
varying vec3 vWN; varying vec3 vWorld; varying float vY;
void main() {
  #include <logdepthbuf_fragment>
  vec3 V = normalize(cameraPosition - vWorld);
  float edge = pow(abs(dot(normalize(vWN), V)), 1.6);
  float drift = 0.75 + 0.25 * sin(vWorld.x * 0.02 + vWorld.z * 0.015 + uTime * 0.35) * sin(vWorld.y * 0.01 - uTime * 0.2);
  float a = uAlpha * edge * smoothstep(0.0, 0.35, vY) * smoothstep(1.0, 0.75, vY) * drift * uLight;
  gl_FragColor = vec4(uCol * a, a);
}`;
export function shaftMaterial(color = '#fff2c4', alpha = 0.08) {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uTime: LIGHT.time, uLight: TOON_LIGHT },
    vertexShader: SVERT, fragmentShader: SFRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// soft round sprites for drifting mist and motes (size in mm, attenuated by distance)
const PVERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uScale; attribute float aSize; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, 64.0);
  vA = smoothstep(0.2, 2.0, -mv.z) * smoothstep(90.0, 40.0, -mv.z);
  #include <logdepthbuf_vertex>
}`;
const PFRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCol; uniform float uAlpha, uLight; varying float vA;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
  float a = smoothstep(0.25, 0.0, d) * uAlpha * vA * (0.35 + 0.65 * uLight);
  gl_FragColor = vec4(uCol, a);
}`;
export function moteMaterial(color = '#e8fff0', alpha = 0.5) {
  return new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uScale: { value: 600 }, uLight: TOON_LIGHT }, vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false });
}
