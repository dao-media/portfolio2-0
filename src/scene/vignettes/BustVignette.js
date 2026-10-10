import * as THREE from "three";
import { noteFlight } from "../stage/flightRecorder.js";
import { createGltfLoader } from "../loaders/createGltfLoader.js";
import { NEON_FOG_LAYER } from "../stage/constants.js";
import {
  BUST_LANTERN_HEIGHT_M,
  LANTERN_LIGHT
} from "../neon/makeNeonLantern.js";
import {
  LAWN_BLADE_DENSITY,
  LAWN_BLADE_LENGTH,
  LAWN_BREEZE_SPEED,
  LAWN_BREEZE_STRENGTH,
  LAWN_COVERAGE_NOISE_SCALE,
  LAWN_EDGE_FALLOFF,
  LAWN_PATCH_SCALE,
  LAWN_SHAPE_DISTORTION,
  LAWN_STRAGGLER_DENSITY,
  LAWN_TUFT_AMOUNT,
  createLawnEdgeParams
} from "./lawnEdgeConfig.js";
import { GrassEngine } from "../../grass/GrassEngine.js";
// Sidelined: `./bustLightParticles.js` (GPGPU light cloud) — keep for a later stop/experiment.

const BUST_URL = "/assets/models/bust/runtime/bust.glb";
const APPLE_URL = "/assets/models/apple-tree/runtime/apple-tree.glb";
/** Trial swap: Meshy fruit tree (masters/…Meshy…glb). Pin/rollback: apple-tree.prev.glb */

/** Target world height (2× prior 2 m framing). */
export const BUST_HEIGHT = 4;
/** Yaw — CCW when viewed from above (Blender Z-up “Z rotate” → Three Y). */
export const BUST_YAW_DEG = 12;

/** Apple canopy — between bust (origin) and neon tube `(2.2, 0.85)`. */
export const APPLE_HEIGHT = 10.07;
/** @deprecated Use APPLE_HEIGHT — stop-0 tree is apple, not maple. */
export const MAPLE_HEIGHT = APPLE_HEIGHT;
/** Yaw — Blender Z-up “Z rotate” → Three Y (+10° CCW from above). */
export const APPLE_YAW_DEG = -335;
/** @deprecated Use APPLE_YAW_DEG */
export const MAPLE_YAW_DEG = APPLE_YAW_DEG;
/** Clear of the neon tube and the bust (canopy ~5 m wide at this height). */
export const APPLE_POS = Object.freeze({ x: 3.17, z: -3.25 });
/** @deprecated Use APPLE_POS */
export const MAPLE_POS = APPLE_POS;
/**
 * Extra bury past the measured base-platform *top* (m). Keep tiny — just
 * enough that the Meshy dirt disc clears the apron; large values bury roots.
 */
export const APPLE_BASE_SINK = 0.02;

/**
 * Leaf-only neon falloff (global PointLight stays short for single-source falloff).
 * Canopy verts sit ~2–12 m from the tube; `LEAF_LIGHT_DISTANCE` puts near leaves
 * on the hot shoulder and far/inner leaves on the steep cutoff.
 */
export const LEAF_LIGHT_DISTANCE = 4.8;
/** Beer-lambert extinction along light→canopy axis (1/m) — fake leaf-on-leaf occlusion. */
export const LEAF_EXTINCTION = 0.95;
/** Multiply at canopy floor (lower/inner leaves); 1 at canopy top. */
export const LEAF_HEIGHT_DARK = 0.4;
/** Bust-stop neon tube XZ (matches vignette def default). */
export const BUST_NEON_XZ = Object.freeze({ x: 2.2, z: 0.85 });

/**
 * Lawn patch under bust / apple / neon (Bust stop only).
 * Centered on the trio centroid; radius at patchScale=1 covers all three + margin.
 */
const _grassAnchors = [
  { x: 0, z: 0 }, // bust pedestal
  { x: BUST_NEON_XZ.x, z: BUST_NEON_XZ.z },
  { x: APPLE_POS.x, z: APPLE_POS.z }
];
const _grassCx =
  (_grassAnchors[0].x + _grassAnchors[1].x + _grassAnchors[2].x) / 3;
const _grassCz =
  (_grassAnchors[0].z + _grassAnchors[1].z + _grassAnchors[2].z) / 3;
/** Extra meters past the farthest of bust / neon / tree. */
export const GRASS_COVER_MARGIN = 1.35;
const _grassCoverR =
  Math.max(
    ..._grassAnchors.map((p) => Math.hypot(p.x - _grassCx, p.z - _grassCz))
  ) + GRASS_COVER_MARGIN;

/** Patch origin — centroid of bust + neon + apple (not an arbitrary offset). */
export const GRASS_POS = Object.freeze({
  x: +_grassCx.toFixed(3),
  z: +_grassCz.toFixed(3)
});
/** Lift above MeshBasic stage floor to avoid z-fight. */
export const GRASS_Y = 0.006;
/** Uniform Y kept for legacy docs — procedural blades author height in GrassEngine (root Y scale = 1). */
export const GRASS_HEIGHT_SCALE = 0.28;
/**
 * Legacy alias — runtime patch size expands placement radius (`GRASS_RADIUS * patchScale`),
 * not root XZ scale. Live via LawnEdgeTuner.
 */
export const GRASS_XZ_SCALE = LAWN_PATCH_SCALE;
/**
 * Placement radius at patchScale = 1 — big enough to sit under bust, neon, and tree.
 * (~4.16 m = farthest anchor + GRASS_COVER_MARGIN).
 */
export const GRASS_RADIUS = +_grassCoverR.toFixed(3);
/** @deprecated Radial fade removed — noise coverage. Kept for any stale refs. */
export const GRASS_FADE_START = 0.72;
/** @deprecated Radial fade removed — noise coverage. */
export const GRASS_FADE_END = 1.05;

/**
 * Bust / tree / tube layout in grass-local XZ.
 * Root is unscaled (scale=1): locals = world − GRASS_POS.
 * @param {number} [scale] unused legacy — kept for call sites; always treat as 1
 */
export function grassLayoutForScale(scale = 1) {
  const s = Math.max(Number(scale) || 1, 1e-4);
  return {
    bustLocal: {
      x: (0 - GRASS_POS.x) / s,
      z: (0 - GRASS_POS.z) / s
    },
    treeLocal: {
      x: (APPLE_POS.x - GRASS_POS.x) / s,
      z: (APPLE_POS.z - GRASS_POS.z) / s
    },
    tubeLocal: {
      x: (BUST_NEON_XZ.x - GRASS_POS.x) / s,
      z: (BUST_NEON_XZ.z - GRASS_POS.z) / s
    },
    // Pedestal obstacle — ellipse ≈ seated foot (maxR ≈0.93 m). Lip = 1 so
    // grass only clears the stone base (no wide flattened ring / shove zone).
    bustHalfX: 0.98 / s,
    bustHalfZ: 0.88 / s,
    bustYaw: THREE.MathUtils.degToRad(BUST_YAW_DEG),
    bustLipMin: 1,
    bustLipJitter: 0,
    bustClear: 1.05 / s,
    bustClearFeather: 0.35 / s,
    bustPeak: 1.15 / s,
    bustOuter: 1.85 / s,
    treeInner: 0.35 / s,
    treeOuter: 2.1 / s,
    /** Hard cull under lantern foot (~0.44 m half-span + margin). */
    tubeClear: 0.55 / s,
    /** Tuft ring outside the clear (no blades under the base). */
    tubeInner: 0.58 / s,
    tubeOuter: 1.2 / s
  };
}

const _layout0 = grassLayoutForScale(1);

/** Grass-local XZ of the bust / apple — divide by XZ scale so tufts track props. */
export const GRASS_BUST_LOCAL = Object.freeze({ ..._layout0.bustLocal });
export const GRASS_TREE_LOCAL = Object.freeze({ ..._layout0.treeLocal });
/** Pedestal ellipse half-extents (world m) — grass displaces only under the base. */
export const GRASS_BUST_HALF_X_M = _layout0.bustHalfX;
export const GRASS_BUST_HALF_Z_M = _layout0.bustHalfZ;
export const GRASS_BUST_YAW_RAD = _layout0.bustYaw;
export const GRASS_BUST_LIP_MIN = _layout0.bustLipMin;
export const GRASS_BUST_LIP_JITTER = _layout0.bustLipJitter;
/** Legacy probes — mean pedestal radius / soft shell (displacement owns the look). */
export const GRASS_BUST_CLEAR_M = _layout0.bustClear;
export const GRASS_BUST_CLEAR_FEATHER_M = _layout0.bustClearFeather;
export const GRASS_BUST_RING_PEAK_M = _layout0.bustPeak;
export const GRASS_BUST_RING_OUTER_M = _layout0.bustOuter;
export const GRASS_BUST_HEIGHT_BOOST = 0.95;
/** Tall tufts clustered at the apple trunk. */
export const GRASS_TREE_TUFT_INNER_M = _layout0.treeInner;
export const GRASS_TREE_TUFT_OUTER_M = _layout0.treeOuter;
export const GRASS_TREE_TUFT_BOOST = 1.55;
/** Lantern foot clearance — blades culled + ground hole (not a thin neon tube). */
export const GRASS_TUBE_LOCAL = Object.freeze({ ..._layout0.tubeLocal });
export const GRASS_TUBE_CLEAR_M = _layout0.tubeClear;
export const GRASS_TUBE_TUFT_INNER_M = _layout0.tubeInner;
export const GRASS_TUBE_TUFT_OUTER_M = _layout0.tubeOuter;
export const GRASS_TUBE_TUFT_BOOST = 1.35;

/**
 * WebGLRenderer cannot selective-light via layers. Attenuate POV spot + indirect
 * on apple / canopy leaves so the stop neon PointLight is the key (§21 / C07).
 *
 * Also: leaf-only falloff remap + fake canopy self-shadow (optical depth along
 * the light→canopy axis). Global neon distance stays short (`NEON_LIGHT_DISTANCE`)
 * for single-source falloff — do not raise it to “fix” the canopy.
 *
 * three@0.172 calls `onBeforeCompile` **before** `#include` resolution — patch the
 * include line itself (spot `getSpotLightInfo` is not in the string yet).
 * @param {THREE.MeshStandardMaterial} material
 * @param {number} spotScale
 * @param {number} indirectScale
 * @param {{
 *   leafLightDistance: number,
 *   extinction: number,
 *   heightDark: number,
 *   neonWorld: THREE.Vector3,
 *   canopyCenter: THREE.Vector3,
 *   canopyMinY: number,
 *   canopyMaxY: number,
 *   nearAlong: number
 * }} canopy
 */
function patchLeafNeonKey(material, spotScale, indirectScale, canopy) {
  if (material.userData.__mapleNeonKey) return;
  material.userData.__mapleNeonKey = true;
  const spotMul = spotScale.toFixed(4);
  const indMul = indirectScale.toFixed(4);
  const leafDist = canopy.leafLightDistance.toFixed(3);
  const extinction = canopy.extinction.toFixed(3);
  const heightDark = canopy.heightDark.toFixed(3);
  const nx = canopy.neonWorld.x.toFixed(3);
  const ny = canopy.neonWorld.y.toFixed(3);
  const nz = canopy.neonWorld.z.toFixed(3);
  const cx = canopy.canopyCenter.x.toFixed(3);
  const cy = canopy.canopyCenter.y.toFixed(3);
  const cz = canopy.canopyCenter.z.toFixed(3);
  const minY = canopy.canopyMinY.toFixed(3);
  const maxY = canopy.canopyMaxY.toFixed(3);
  const nearAlong = canopy.nearAlong.toFixed(3);
  material.customProgramCacheKey = () =>
    `apple-neon-key:v3:${spotMul}:${indMul}:${leafDist}:${extinction}:${heightDark}:${nearAlong}`;
  material.onBeforeCompile = (parameters) => {
    parameters.vertexShader = parameters.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vLeafWorldPos;`
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
vLeafWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`
      );
    parameters.fragmentShader = parameters.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vLeafWorldPos;`
      )
      .replace(
        "#include <lights_fragment_begin>",
        leafLightsFragmentBegin(spotMul, {
          leafDist,
          extinction,
          heightDark,
          nx,
          ny,
          nz,
          cx,
          cy,
          cz,
          minY,
          maxY,
          nearAlong
        })
      )
      .replace(
        "#include <lights_fragment_end>",
        `reflectedLight.indirectDiffuse *= ${indMul};
	reflectedLight.indirectSpecular *= ${indMul};
	#include <lights_fragment_end>`
      )
      .replace(
        "#include <opaque_fragment>",
        `// Canopy occlusion + falloff on final outgoing light (world-space).
	{
		vec3 leafNeonW3 = vec3( ${nx}, ${ny}, ${nz} );
		vec3 leafAxis3 = normalize( vec3( ${cx}, ${cy}, ${cz} ) - leafNeonW3 );
		float leafDepth3 = max( dot( vLeafWorldPos - leafNeonW3, leafAxis3 ) - ${nearAlong}, 0.0 );
		float leafOptical3 = exp( -${extinction} * leafDepth3 );
		float leafH3 = saturate( ( vLeafWorldPos.y - ${minY} ) / max( ${maxY} - ${minY}, 1e-3 ) );
		float leafHeight3 = mix( ${heightDark}, 1.0, pow( leafH3, 0.75 ) );
		float leafWorldDist3 = length( vLeafWorldPos - leafNeonW3 );
		float leafDistGate3 = pow( saturate( 1.0 - leafWorldDist3 / max( ${leafDist}, 1e-3 ) ), 2.2 );
		outgoingLight *= max( leafOptical3 * leafHeight3 * leafDistGate3, 0.02 );
	}
	#include <opaque_fragment>`
      );
  };
}

/**
 * Inlined `lights_fragment_begin` with spot × spotScale + leaf canopy shading.
 * @param {string} spotMul
 * @param {Record<string, string>} c compile-time canopy constants
 */
function leafLightsFragmentBegin(spotMul, c) {
  return /* glsl */ `
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	vec3 leafNeonW = vec3( ${c.nx}, ${c.ny}, ${c.nz} );
	vec3 leafCanopyC = vec3( ${c.cx}, ${c.cy}, ${c.cz} );
	vec3 leafAxis = normalize( leafCanopyC - leafNeonW );
	float leafHSpan = max( ${c.maxY} - ${c.minY}, 1e-3 );
	// Declared once — #pragma unroll_loop duplicates the body (no redeclare).
	float leafViewDist;
	float authoredAtten;
	float leafAtten;
	float leafRemap;
	float leafAlong;
	float leafDepth;
	float leafOptical;
	float leafH;
	float leafHeightShade;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		// (1) Leaf-only falloff: remap authored cutoff (14) → LEAF_LIGHT_DISTANCE so
		// the canopy spans the steep part of the curve (near hot, far dark).
		leafViewDist = length( pointLight.position - geometryPosition );
		authoredAtten = getDistanceAttenuation( leafViewDist, pointLight.distance, pointLight.decay );
		leafAtten = getDistanceAttenuation( leafViewDist, ${c.leafDist}, pointLight.decay );
		leafRemap = ( authoredAtten > 1e-6 ) ? ( leafAtten / authoredAtten ) : 0.0;
		// Tighter pow4 cutoff dims the near shoulder slightly — recover it so near
		// leaves read hot while far still dies past LEAF_LIGHT_DISTANCE.
		leafRemap *= mix( 1.85, 1.0, saturate( leafViewDist / max( ${c.leafDist}, 1e-3 ) ) );
		directLight.color *= leafRemap;
		// (2) Fake self-shadow: Beer-lambert along light→canopy axis + lower-leaf darken.
		leafAlong = dot( vLeafWorldPos - leafNeonW, leafAxis );
		leafDepth = max( leafAlong - ${c.nearAlong}, 0.0 );
		leafOptical = exp( -${c.extinction} * leafDepth );
		leafH = saturate( ( vLeafWorldPos.y - ${c.minY} ) / leafHSpan );
		leafHeightShade = mix( ${c.heightDark}, 1.0, pow( leafH, 0.75 ) );
		directLight.color *= leafOptical * leafHeightShade;
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		directLight.color *= ${spotMul};
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif
`;
}

export const bustVignetteMeta = {
  name: "Bust",
  tint: 0xffb37a,
  /** Warm lantern palette (not lime/cyan neon). */
  neonColors: ["#ffa45a", "#ffc878"],
  /** Bust stop uses the lantern GLB instead of the procedural neon cylinder. */
  neonProp: "lantern",
  neonTubeXZ: /** @type {[number, number]} */ ([2.2, 0.85]),
  desc: "Arrival stop — bust, apple tree, lawn, and lantern."
};

/**
 * Arrival stop — bust + apple tree on a soft-edged lawn patch (lantern shares the patch).
 * GLBs load on the shared boot LoadingManager (gates the XP fader).
 */
export class BustVignette {
  /**
   * @param {THREE.Group} group
   * @param {{
   *   vignetteIndex?: number,
   *   loadingManager?: import("three").LoadingManager,
   *   deferModelLoad?: boolean,
   *   renderer?: import("three").WebGLRenderer,
   *   reducedMotion?: boolean,
   *   onAligned?: () => void
   * }} deps
   */
  constructor(group, deps = {}) {
    this.group = group;
    this.vignetteIndex = deps.vignetteIndex ?? 0;
    this.loadingManager = deps.loadingManager ?? null;
    this.renderer = deps.renderer ?? null;
    this.reducedMotion = Boolean(deps.reducedMotion);
    this.onAligned = deps.onAligned ?? null;
    /** Pass S — called with the bust root right after mount, before any compile. */
    this.onBustMounted = deps.onBustMounted ?? null;
    this.bustRoot = null;
    this.appleRoot = null;
    this.grassRoot = null;
    /** @type {import("../../grass/GrassEngine.js").GrassEngine | null} */
    this.grassEngine = null;
    /** @deprecated alias — stop-0 tree is apple */
    this.mapleRoot = null;
    this._modelLoadStarted = false;
    this._modelLoadSettled = false;
    /** @type {Record<string, number>} */
    this._lawnEdgeParams = createLawnEdgeParams();

    if (!deps.deferModelLoad) {
      this.startModelLoad();
    }
  }

  startModelLoad({ retry = false } = {}) {
    if (this.bustRoot && this.appleRoot && this.grassRoot) return;
    if (this._modelLoadStarted && !retry) return;
    this._modelLoadStarted = true;
    this._modelLoadSettled = false;
    void this._loadModels();
  }

  async _loadModels() {
    const loader = createGltfLoader(this.loadingManager ?? undefined);
    // Pass L — Bust readiness gates Enter; show where its time goes.
    noteFlight("bust-load", { phase: "start", t: Math.round(performance.now()) });
    const timed = (url, name) =>
      loader.loadAsync(url).then((r) => {
        noteFlight("bust-load", { phase: `${name}-loaded`, t: Math.round(performance.now()) });
        return r;
      });
    const [bustResult, appleResult] = await Promise.allSettled([
      timed(BUST_URL, "bust"),
      timed(APPLE_URL, "apple")
    ]);

    // Procedural meadow — sync, no GLB / LoadingManager item
    this._mountGrass();

    if (bustResult.status === "fulfilled") {
      this._mountBust(bustResult.value.scene);
    } else {
      console.warn("[BustVignette] Failed to load bust.", bustResult.reason);
    }

    if (appleResult.status === "fulfilled") {
      this._mountApple(appleResult.value.scene);
    } else {
      console.warn("[BustVignette] Failed to load apple tree.", appleResult.reason);
    }

    this._modelLoadSettled = true;
    noteFlight("bust-load", { phase: "settled", t: Math.round(performance.now()) });
    if (this.bustRoot || this.appleRoot || this.grassRoot) {
      this.onAligned?.();
    }
  }

  /**
   * Grassworks-class instanced meadow (finite Bust patch).
   * Hash placement × coverage × tip wind — replaces lawn-grass-stump GLB.
   */
  _mountGrass() {
    if (this.grassRoot) return;

    const p = this._lawnEdgeParams;
    const patchScale = p.patchScale ?? LAWN_PATCH_SCALE;
    // Root unscaled — patch size expands placement radius; tufts in grass-local meters
    const layout = grassLayoutForScale(1);
    const radius = GRASS_RADIUS * patchScale;

    const engine = new GrassEngine({
      radius,
      bladeLength: p.bladeLength ?? LAWN_BLADE_LENGTH,
      bladeDensity: p.bladeDensity ?? LAWN_BLADE_DENSITY,
      tuftAmount: p.tuftAmount ?? LAWN_TUFT_AMOUNT,
      coverage: {
        coverageNoiseScale: p.coverageNoiseScale,
        edgeFalloff: p.edgeFalloff,
        stragglerDensity: p.stragglerDensity,
        shapeDistortion: p.shapeDistortion
      },
      layout
    });

    const root = engine.root;
    root.scale.set(1, 1, 1);
    root.position.set(GRASS_POS.x, GRASS_Y, GRASS_POS.z);
    // Seat against blade bottoms only — if Grass_ground is already at −0.06,
    // reseat lifts the whole lawn and cancels the bury.
    if (engine.ground) engine.ground.position.y = 0;
    root.updateMatrixWorld(true);
    this._reseatBottom(root);
    root.position.y = Math.max(root.position.y, GRASS_Y);
    if (engine.ground) engine.ground.position.y = -0.06;

    this.group.add(root);
    this.grassRoot = root;
    this.grassEngine = engine;
    engine.setBreeze({
      breezeStrength: p.breezeStrength ?? LAWN_BREEZE_STRENGTH,
      breezeSpeed: p.breezeSpeed ?? LAWN_BREEZE_SPEED
    });
  }

  /**
   * @param {THREE.Object3D} scene
   */
  _mountBust(scene) {
    if (this.bustRoot) return;

    const root = scene;
    root.name = "bust";
    this._scaleSeat(root, BUST_HEIGHT);
    root.rotation.y = THREE.MathUtils.degToRad(BUST_YAW_DEG);
    root.updateMatrixWorld(true);
    this._reseatBottom(root);
    this._tagMeshes(root);

    this.group.add(root);
    this.bustRoot = root;
    // Pass S — the stage fulfils SSOT env requests before the first compile.
    this.onBustMounted?.(root);
  }

  /**
   * @param {THREE.Object3D} scene
   */
  _mountApple(scene) {
    if (this.appleRoot) return;

    const root = scene;
    root.name = "apple-tree";
    this._scaleSeat(root, APPLE_HEIGHT);
    // Seat first so the foot sample is on Y=0, then pivot so yaw spins about the trunk.
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    this._reseatBottom(root);

    const foot = this._trunkFootLocal(root);
    root.position.x -= foot.x;
    root.position.z -= foot.z;
    root.position.y -= foot.y;
    root.updateMatrixWorld(true);

    // Sink so the dirt-pad / coin TOP sits just under the apron — roots stay visible.
    // `_basePlatformTopLocal` is pre-scale root-local Y; pivot.y is world/parent
    // units, so multiply by root.scale.y (≈1.68 for APPLE_HEIGHT) or the coin
    // still sticks ~deckTop*(scale-1) above the apron.
    const deckTop = this._basePlatformTopLocal(root);
    const scaleY = root.scale.y || 1;
    const sink = Math.max(0, deckTop) * scaleY + APPLE_BASE_SINK;

    const pivot = new THREE.Group();
    pivot.name = "apple-tree-pivot";
    pivot.add(root);
    pivot.position.set(APPLE_POS.x, -sink, APPLE_POS.z);
    pivot.rotation.y = THREE.MathUtils.degToRad(APPLE_YAW_DEG);
    pivot.updateMatrixWorld(true);

    this._tagMeshes(root);
    this._smoothTreeShading(root);
    this.group.add(pivot);
    this.appleRoot = pivot;
    this.mapleRoot = pivot;
    this.group.updateMatrixWorld(true);
    this._hardenTreeMaterials(root);
  }

  /**
   * Local-space point where the trunk meets the ground (yaw pivot).
   * Uses the XZ centroid of the lowest band of mesh vertices so an asymmetric
   * canopy does not pull the AABB center off the trunk.
   * @param {THREE.Object3D} root
   * @returns {THREE.Vector3}
   */
  _trunkFootLocal(root) {
    const samples = this._collectAppleLocalVerts(root);
    if (!samples.length) {
      const box = new THREE.Box3().setFromObject(root);
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      return new THREE.Vector3(
        (box.min.x + box.max.x) * 0.5,
        box.min.y,
        (box.min.z + box.max.z) * 0.5
      ).applyMatrix4(inv);
    }

    let minY = Infinity;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].y < minY) minY = samples[i].y;
    }
    let maxY = -Infinity;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].y > maxY) maxY = samples[i].y;
    }
    const band = Math.max(0.04, (maxY - minY) * 0.04);
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].y > minY + band) continue;
      sx += samples[i].x;
      sz += samples[i].z;
      n += 1;
    }
    if (n < 1) return new THREE.Vector3(0, minY, 0);
    return new THREE.Vector3(sx / n, minY, sz / n);
  }

  /**
   * Height of the dirt-pad / grass-coin TOP in pre-scale root-local Y
   * (after foot at origin). Caller must multiply by `root.scale.y` before
   * applying as pivot sink — local Y is not world meters once `_scaleSeat` runs.
   * Mode alone sits mid-slab; use p97 of wide lower-band verts so the disc top
   * (not mid-thickness) goes under the apron.
   * @param {THREE.Object3D} root
   * @returns {number}
   */
  _basePlatformTopLocal(root) {
    const samples = this._collectAppleLocalVerts(root);
    if (!samples.length) return this._baseDeckHeightLocal(root);

    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < samples.length; i++) {
      const y = samples[i].y;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const height = Math.max(maxY - minY, 1e-4);
    // Lower band only — dirt coin, not trunk flare / canopy.
    const yHi = minY + height * 0.14;
    // Keep a tiny core skip so hanging root tips on-axis don't dominate;
    // do NOT use a large trunkR — the Meshy coin lives inside ~0.65 local.
    const coreR = Math.max(0.12, height * 0.012);
    /** @type {number[]} */
    const wideYs = [];
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      if (p.y < minY - 1e-4 || p.y > yHi) continue;
      if (Math.hypot(p.x, p.z) <= coreR) continue;
      wideYs.push(p.y);
    }
    if (wideYs.length < 24) {
      return Math.max(this._baseDeckHeightLocal(root), 0);
    }
    wideYs.sort((a, b) => a - b);
    // Max of the wide lower band = coin rim / disc top. p97 left the upper
    // lip (~0.2 m after scale) still peeking above the apron.
    const top = wideYs[wideYs.length - 1];
    return Math.max(0, top);
  }

  /**
   * Densest Y of the wide lower band (mid-slab). Kept for probes / fallback.
   * @param {THREE.Object3D} root
   * @returns {number}
   */
  _baseDeckHeightLocal(root) {
    const samples = this._collectAppleLocalVerts(root);
    if (!samples.length) return 0;

    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < samples.length; i++) {
      const y = samples[i].y;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const height = Math.max(maxY - minY, 1e-4);
    // Lower fifth of the tree; outside the trunk column (platform ring).
    const yHi = minY + height * 0.2;
    const trunkR = Math.max(0.55, height * 0.05);
    const binW = Math.max(0.012, height * 0.0015);
    /** @type {Map<number, number>} */
    const bins = new Map();
    let wideN = 0;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      if (p.y < minY - 1e-4 || p.y > yHi) continue;
      if (Math.hypot(p.x, p.z) <= trunkR) continue;
      wideN += 1;
      const b = Math.round(p.y / binW) * binW;
      bins.set(b, (bins.get(b) || 0) + 1);
    }
    if (wideN < 16 || bins.size < 1) {
      // Fallback: high percentile of lower-band verts (any radius).
      /** @type {number[]} */
      const ys = [];
      const cut = minY + height * 0.12;
      for (let i = 0; i < samples.length; i++) {
        if (samples[i].y <= cut) ys.push(samples[i].y);
      }
      if (!ys.length) return 0;
      ys.sort((a, b) => a - b);
      return Math.max(0, ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.92))]);
    }

    // Strongest mode above hanging tips — that slab is the dirt-platform top.
    const tipCut = minY + Math.max(0.03, height * 0.004);
    let bestY = 0;
    let bestC = 0;
    for (const [y, c] of bins) {
      if (y < tipCut) continue;
      if (c > bestC) {
        bestC = c;
        bestY = y;
      }
    }
    if (bestC < 1) {
      for (const [y, c] of bins) {
        if (c > bestC) {
          bestC = c;
          bestY = y;
        }
      }
    }
    return Math.max(0, bestY);
  }

  /**
   * @param {THREE.Object3D} root
   * @returns {THREE.Vector3[]}
   */
  _collectAppleLocalVerts(root) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const v = new THREE.Vector3();
    /** @type {THREE.Vector3[]} */
    const locals = [];
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const pos = obj.geometry.attributes?.position;
      if (!pos) return;
      obj.updateWorldMatrix(true, false);
      // Stride sample dense Meshy meshes — still enough for foot / deck stats.
      const stride = pos.count > 40000 ? 4 : pos.count > 12000 ? 2 : 1;
      for (let i = 0; i < pos.count; i += stride) {
        v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld).applyMatrix4(inv);
        locals.push(v.clone());
      }
    });
    return locals;
  }

  /**
   * Soften faceted bark/trunk/branch (OBJ often ships flat-shaded).
   * Leaf cards stay as-authored — they're meant to be flat billboards.
   * @param {THREE.Object3D} root
   */
  _smoothTreeShading(root) {
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const name = `${obj.name} ${obj.material?.name ?? ""}`.toLowerCase();
      if (name.includes("leaf") || name.includes("lea")) return;
      obj.geometry.deleteAttribute("normal");
      obj.geometry.computeVertexNormals();
      obj.geometry.computeBoundingSphere();
    });
  }

  /**
   * Uniform scale to target height (pre-seat).
   * @param {THREE.Object3D} root
   * @param {number} heightM
   */
  _scaleSeat(root, heightM) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const scale = heightM / Math.max(size.y, 1e-6);
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
  }

  /** Seat bottom on group-local Y=0 (keeps XZ). */
  _reseatBottom(root) {
    root.updateMatrixWorld(true);
    const seated = new THREE.Box3().setFromObject(root);
    root.position.y -= seated.min.y;
  }

  /**
   * Live lawn-edge RESPONSE knobs (LawnEdgeTuner). Does not touch fog/glitch/bust mesh.
   * Rebuilds GrassEngine placement when coverage / patch size changes.
   * @param {Partial<Record<string, number>>} [partial]
   */
  setLawnEdgeParams(partial = {}) {
    const prev = this._lawnEdgeParams;
    const next = { ...prev, ...partial };
    // Patch size: floor only — no upper limit (expands radius + blade count)
    next.patchScale = Math.max(
      0.15,
      Number(next.patchScale) || LAWN_PATCH_SCALE
    );
    next.bladeLength = Math.max(
      0.05,
      Number(next.bladeLength) || LAWN_BLADE_LENGTH
    );
    next.bladeDensity = THREE.MathUtils.clamp(
      Number.isFinite(Number(next.bladeDensity))
        ? Number(next.bladeDensity)
        : LAWN_BLADE_DENSITY,
      0.25,
      4
    );
    next.tuftAmount = THREE.MathUtils.clamp(
      Number.isFinite(Number(next.tuftAmount))
        ? Number(next.tuftAmount)
        : LAWN_TUFT_AMOUNT,
      0,
      1
    );
    next.breezeStrength = THREE.MathUtils.clamp(
      Number.isFinite(Number(next.breezeStrength))
        ? Number(next.breezeStrength)
        : LAWN_BREEZE_STRENGTH,
      0,
      0.35
    );
    next.breezeSpeed = THREE.MathUtils.clamp(
      Number.isFinite(Number(next.breezeSpeed))
        ? Number(next.breezeSpeed)
        : LAWN_BREEZE_SPEED,
      0,
      3.5
    );
    next.coverageNoiseScale = THREE.MathUtils.clamp(
      Number(next.coverageNoiseScale) || LAWN_COVERAGE_NOISE_SCALE,
      0.6,
      10
    );
    next.edgeFalloff = THREE.MathUtils.clamp(
      Number(next.edgeFalloff) || LAWN_EDGE_FALLOFF,
      0.4,
      3.5
    );
    next.stragglerDensity = THREE.MathUtils.clamp(
      Number(next.stragglerDensity) || 0,
      0,
      1
    );
    next.shapeDistortion = THREE.MathUtils.clamp(
      Number(next.shapeDistortion) || 0,
      0,
      1
    );
    this._lawnEdgeParams = next;

    // Root stays unit scale — patch size is placement radius, not XZ squash
    if (this.grassRoot) {
      this.grassRoot.scale.set(1, 1, 1);
    }

    if (this.grassEngine) {
      const placementChanged =
        next.patchScale !== prev.patchScale ||
        next.bladeLength !== prev.bladeLength ||
        next.bladeDensity !== prev.bladeDensity ||
        next.tuftAmount !== prev.tuftAmount ||
        next.coverageNoiseScale !== prev.coverageNoiseScale ||
        next.edgeFalloff !== prev.edgeFalloff ||
        next.stragglerDensity !== prev.stragglerDensity ||
        next.shapeDistortion !== prev.shapeDistortion;

      if (placementChanged) {
        this.grassEngine.setParams({
          coverage: {
            coverageNoiseScale: next.coverageNoiseScale,
            edgeFalloff: next.edgeFalloff,
            stragglerDensity: next.stragglerDensity,
            shapeDistortion: next.shapeDistortion
          },
          layout: grassLayoutForScale(1),
          radius: GRASS_RADIUS * next.patchScale,
          bladeLength: next.bladeLength,
          bladeDensity: next.bladeDensity,
          tuftAmount: next.tuftAmount,
          breezeStrength: next.breezeStrength,
          breezeSpeed: next.breezeSpeed
        });
      } else {
        this.grassEngine.setBreeze({
          breezeStrength: next.breezeStrength,
          breezeSpeed: next.breezeSpeed
        });
      }
    }
    return { ...next };
  }

  /**
   * Tip-wind clock for procedural meadow.
   * @param {number} timeSec
   */
  update(timeSec) {
    this.grassEngine?.update?.(timeSec);
  }

  /** @returns {Record<string, number>} */
  getLawnEdgeParams() {
    return { ...this._lawnEdgeParams };
  }

  /**
   * @param {THREE.Object3D} root
   */
  _tagMeshes(root) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
    });
  }

  /**
   * Apple MTL → glTF: strip bump-as-normal + transmission. Lit Standard leaves
   * keyed by the stop neon PointLight. Leaf cards may be opaque (no alpha map).
   *
   * WebGLRenderer does **not** selective-light via layers (spot `layers.set(0)` is
   * a no-op for illumination) — POV spot **118** otherwise flattens the canopy
   * vs neon **10**. Leaf materials attenuate spot + indirect fill in
   * `onBeforeCompile` instead. Do not raise neon intensity/distance (§21).
   * Canopy contrast = leaf-only falloff remap (`LEAF_LIGHT_DISTANCE`) + fake
   * self-shadow (optical depth), not a global light change.
   */
  _hardenTreeMaterials(root) {
    const maxAniso = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
    // Keep albedo readable once spot fill is killed; neon falloff carries the key.
    const LEAF_ALBEDO = 0.25;
    /** POV spot scale on leaf shaders — neon PointLights stay at 1.0. */
    const LEAF_SPOT_SCALE = 0.0;
    /** Ambient/hemi residual on leaves (envMapIntensity is already 0). */
    const LEAF_INDIRECT_SCALE = 0.0;

    const neonWorld = new THREE.Vector3(
      BUST_NEON_XZ.x,
      BUST_LANTERN_HEIGHT_M * LANTERN_LIGHT.flameFrac,
      BUST_NEON_XZ.z
    );
    this.group.localToWorld(neonWorld);

    const canopyBox = new THREE.Box3();
    let hasLeaf = false;
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const name = `${obj.name} ${obj.material?.name ?? ""}`.toLowerCase();
      if (!name.includes("leaf") && !name.includes("lea")) return;
      canopyBox.expandByObject(obj);
      hasLeaf = true;
    });
    if (!hasLeaf) canopyBox.setFromObject(root);
    const canopyCenter = canopyBox.getCenter(new THREE.Vector3());
    const canopyMinY = canopyBox.min.y;
    const canopyMaxY = canopyBox.max.y;
    const axis = canopyCenter.clone().sub(neonWorld).normalize();
    // Lit-face distance along the light→canopy axis (nearest AABB corner).
    let nearAlong = Infinity;
    const corner = new THREE.Vector3();
    for (let ix = 0; ix < 2; ix += 1) {
      for (let iy = 0; iy < 2; iy += 1) {
        for (let iz = 0; iz < 2; iz += 1) {
          corner.set(
            ix ? canopyBox.max.x : canopyBox.min.x,
            iy ? canopyBox.max.y : canopyBox.min.y,
            iz ? canopyBox.max.z : canopyBox.min.z
          );
          nearAlong = Math.min(nearAlong, corner.clone().sub(neonWorld).dot(axis));
        }
      }
    }
    if (!Number.isFinite(nearAlong)) nearAlong = 0;

    const canopy = {
      leafLightDistance: LEAF_LIGHT_DISTANCE,
      extinction: LEAF_EXTINCTION,
      heightDark: LEAF_HEIGHT_DARK,
      neonWorld,
      canopyCenter,
      canopyMinY,
      canopyMaxY,
      nearAlong
    };

    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const name = `${obj.name} ${obj.material?.name ?? ""}`.toLowerCase();
      const leaf = name.includes("leaf") || name.includes("lea");
      // Layer 2 keeps leaves in the fog/camera mask with neon tubes; it does NOT
      // exclude the POV spot (WebGL has no selective lighting). Bark/pot on 0.
      if (leaf) obj.layers.set(NEON_FOG_LAYER);
      else obj.layers.set(0);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const nextMats = [];
      for (const mat of mats) {
        if (!mat) {
          nextMats.push(mat);
          continue;
        }

        // Leaves: always rebuild as MeshStandard — Physical extends Standard
        // (`isMeshStandardMaterial` is true) so a Basic-only swap left Physical
        // sheen/clearcoat/IBL extras that flatten the neon key.
        let lit = mat;
        if (
          leaf &&
          (mat.isMeshPhysicalMaterial ||
            mat.isMeshBasicMaterial ||
            mat.isMeshLambertMaterial ||
            !mat.isMeshStandardMaterial)
        ) {
          lit = new THREE.MeshStandardMaterial({
            map: mat.map ?? null,
            alphaMap: mat.alphaMap ?? null,
            color: mat.color?.clone?.() ?? new THREE.Color(0xffffff),
            side: THREE.DoubleSide,
            transparent: Boolean(mat.transparent),
            opacity: mat.opacity ?? 1,
            alphaTest: mat.alphaTest ?? 0,
            depthWrite: mat.depthWrite !== false,
            metalness: Math.min(mat.metalness ?? 0, 0.02),
            roughness: Math.max(mat.roughness ?? 0.5, 0.72),
            envMapIntensity: 0
          });
          mat.dispose?.();
        } else if (
          !leaf &&
          (mat.isMeshBasicMaterial || mat.isMeshLambertMaterial)
        ) {
          lit = new THREE.MeshStandardMaterial({
            map: mat.map ?? null,
            alphaMap: mat.alphaMap ?? null,
            color: mat.color?.clone?.() ?? new THREE.Color(0xffffff),
            side: THREE.DoubleSide,
            transparent: Boolean(mat.transparent),
            opacity: mat.opacity ?? 1,
            alphaTest: mat.alphaTest ?? 0,
            depthWrite: mat.depthWrite !== false,
            metalness: Math.min(mat.metalness ?? 0, 0.02),
            roughness: Math.max(mat.roughness ?? 0.5, 0.68),
            envMapIntensity: 0.04
          });
          mat.dispose?.();
        }

        if (lit.normalMap) lit.normalMap = null;
        if ("transmission" in lit) lit.transmission = 0;
        if ("thickness" in lit) lit.thickness = 0;
        if ("attenuationDistance" in lit) lit.attenuationDistance = Infinity;
        if ("specularIntensity" in lit) lit.specularIntensity = Math.min(lit.specularIntensity ?? 1, 0.2);
        if (lit.emissive) lit.emissive.setRGB(0, 0, 0);
        if ("emissiveIntensity" in lit) lit.emissiveIntensity = 0;

        lit.flatShading = false;
        lit.metalness = Math.min(lit.metalness ?? 0, 0.02);
        lit.roughness = Math.max(lit.roughness ?? 0.5, leaf ? 0.72 : 0.68);
        lit.envMapIntensity = leaf ? 0 : 0.04;
        lit.side = THREE.DoubleSide;
        lit.depthWrite = true;

        if (leaf) {
          lit.color.multiplyScalar(LEAF_ALBEDO);
          lit.transparent = true;
          lit.alphaTest = 0.08;
          lit.opacity = 1;
          lit.depthWrite = true;
          obj.castShadow = false;
          obj.receiveShadow = true;
          lit.polygonOffset = true;
          lit.polygonOffsetFactor = 1;
          lit.polygonOffsetUnits = 1;
          patchLeafNeonKey(lit, LEAF_SPOT_SCALE, LEAF_INDIRECT_SCALE, canopy);
          for (const tex of [lit.map, lit.alphaMap]) {
            if (!tex) continue;
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = Math.min(8, maxAniso);
            tex.needsUpdate = true;
          }
          if (obj.geometry && !obj.geometry.userData.__mapleLeafNormals) {
            obj.geometry.deleteAttribute("normal");
            obj.geometry.computeVertexNormals();
            obj.geometry.userData.__mapleLeafNormals = true;
          }
        } else {
          lit.transparent = false;
          lit.opacity = 1;
          lit.alphaTest = 0;
          if (lit.map) {
            lit.map.generateMipmaps = true;
            lit.map.minFilter = THREE.LinearMipmapLinearFilter;
            lit.map.magFilter = THREE.LinearFilter;
            lit.map.anisotropy = Math.min(8, maxAniso);
            lit.map.needsUpdate = true;
          }
        }

        lit.needsUpdate = true;
        nextMats.push(lit);
      }
      obj.material = nextMats.length === 1 ? nextMats[0] : nextMats;
    });
  }

  /**
   * Inflate each leaf-card island from its own centroid so gaps close without
   * hollowing the canopy (a whole-mesh scale from bbox center did that).
   * Magenta-BG probe: “black checkers” were STAGE_BG showing through sparse cards.
   * @param {THREE.Object3D} root
   * @param {number} factor
   */
  _expandLeafCards(root, factor) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const name = `${obj.name} ${obj.material?.name ?? ""}`.toLowerCase();
      if (!name.includes("leaf")) return;
      const geo = obj.geometry;
      if (!geo?.attributes?.position || geo.userData.__mapleLeafExpanded) return;
      this._inflateGeometryIslands(geo, factor);
      geo.computeBoundingSphere();
      geo.userData.__mapleLeafExpanded = true;
    });
  }

  /**
   * Scale each connected vertex island about its own centroid.
   * @param {THREE.BufferGeometry} geo
   * @param {number} factor
   */
  _inflateGeometryIslands(geo, factor) {
    const pos = geo.attributes.position;
    const idx = geo.index;
    const vCount = pos.count;
    const parent = new Int32Array(vCount);
    for (let i = 0; i < vCount; i++) parent[i] = i;
    const find = (a) => {
      let x = a;
      while (parent[x] !== x) x = parent[x];
      let y = a;
      while (parent[y] !== y) {
        const p = parent[y];
        parent[y] = x;
        y = p;
      }
      return x;
    };
    const unite = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i);
        const b = idx.getX(i + 1);
        const c = idx.getX(i + 2);
        unite(a, b);
        unite(b, c);
      }
    } else {
      for (let i = 0; i < vCount; i += 3) {
        unite(i, i + 1);
        unite(i + 1, i + 2);
      }
    }

    /** @type {Map<number, { cx: number, cy: number, cz: number, n: number, verts: number[] }>} */
    const islands = new Map();
    for (let i = 0; i < vCount; i++) {
      const r = find(i);
      let island = islands.get(r);
      if (!island) {
        island = { cx: 0, cy: 0, cz: 0, n: 0, verts: [] };
        islands.set(r, island);
      }
      island.cx += pos.getX(i);
      island.cy += pos.getY(i);
      island.cz += pos.getZ(i);
      island.n += 1;
      island.verts.push(i);
    }

    for (const island of islands.values()) {
      const inv = 1 / Math.max(island.n, 1);
      const cx = island.cx * inv;
      const cy = island.cy * inv;
      const cz = island.cz * inv;
      for (const i of island.verts) {
        pos.setXYZ(
          i,
          cx + (pos.getX(i) - cx) * factor,
          cy + (pos.getY(i) - cy) * factor,
          cz + (pos.getZ(i) - cz) * factor
        );
      }
    }
    pos.needsUpdate = true;
    geo.computeBoundingBox();
  }
}
