import * as THREE from "three";
import { createGltfLoader } from "../loaders/createGltfLoader.js";
import { NEON_FOG_LAYER, NEON_LIGHT_HEIGHT } from "../stage/constants.js";
// Sidelined: `./bustLightParticles.js` (GPGPU light cloud) — keep for a later stop/experiment.

const BUST_URL = "/assets/models/bust/runtime/bust.glb";
const APPLE_URL = "/assets/models/apple-tree/runtime/apple-tree.glb";
const GRASS_URL = "/assets/models/lawn-grass-stump/runtime/lawn-grass-stump.glb?v=mild5";

/** Target world height (2× prior 2 m framing). */
export const BUST_HEIGHT = 4;
/** Yaw — CCW when viewed from above (Blender Z-up “Z rotate” → Three Y). */
export const BUST_YAW_DEG = 12;

/** Apple canopy — between bust (origin) and neon tube `(2.2, 0.85)`. */
export const APPLE_HEIGHT = 11.44;
/** @deprecated Use APPLE_HEIGHT — stop-0 tree is apple, not maple. */
export const MAPLE_HEIGHT = APPLE_HEIGHT;
/** Yaw — Blender Z-up “Z rotate” → Three Y (+10° CCW from above). */
export const APPLE_YAW_DEG = 30;
/** @deprecated Use APPLE_YAW_DEG */
export const MAPLE_YAW_DEG = APPLE_YAW_DEG;
/** Clear of the neon tube and the bust (canopy ~5 m wide at this height). */
export const APPLE_POS = Object.freeze({ x: 3.17, z: -3.25 });
/** @deprecated Use APPLE_POS */
export const MAPLE_POS = APPLE_POS;

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
 * Export footprint ~12 m with a mildly irregular outline; runtime XZ ×0.8.
 */
export const GRASS_POS = Object.freeze({ x: 1.55, z: -2.37 });
/** Lift above MeshBasic stage floor to avoid z-fight. */
export const GRASS_Y = 0.006;
/** Uniform XZ kept; Y scale — ~0.28× export ≈ 0.5 m peak blades. */
export const GRASS_HEIGHT_SCALE = 0.28;
/** Whole-patch footprint shrink (20% smaller). */
export const GRASS_XZ_SCALE = 0.8;
/**
 * Soft radial fade as fraction of the local irregular rim.
 * Keep full height farther out so the rim doesn’t go bald, then dissolve past
 * the geometric crop (END > 1) so lobes taper instead of cliff-cutting.
 */
export const GRASS_FADE_START = 0.72;
export const GRASS_FADE_END = 1.05;
export const GRASS_RADIUS = 6;

/** Grass-local XZ of the bust / apple — divide by XZ scale so tufts track props. */
export const GRASS_BUST_LOCAL = Object.freeze({
  x: (0 - GRASS_POS.x) / GRASS_XZ_SCALE,
  z: (0 - GRASS_POS.z) / GRASS_XZ_SCALE
});
export const GRASS_TREE_LOCAL = Object.freeze({
  x: (APPLE_POS.x - GRASS_POS.x) / GRASS_XZ_SCALE,
  z: (APPLE_POS.z - GRASS_POS.z) / GRASS_XZ_SCALE
});
/** Clear tiny footprint under the pedestal, then swell in a ring. */
/** Clear blades under the bust pedestal (+ margin) — world meters / XZ scale. */
export const GRASS_BUST_CLEAR_M = 1.75 / GRASS_XZ_SCALE;
/** Soft outer margin of the clearance (blades ramp 0→1). */
export const GRASS_BUST_CLEAR_FEATHER_M = 0.35 / GRASS_XZ_SCALE;
export const GRASS_BUST_RING_PEAK_M = 2.15 / GRASS_XZ_SCALE;
export const GRASS_BUST_RING_OUTER_M = 2.9 / GRASS_XZ_SCALE;
export const GRASS_BUST_HEIGHT_BOOST = 0.85;
/** Tall tufts clustered at the apple trunk. */
export const GRASS_TREE_TUFT_INNER_M = 0.35 / GRASS_XZ_SCALE;
export const GRASS_TREE_TUFT_OUTER_M = 2.1 / GRASS_XZ_SCALE;
export const GRASS_TREE_TUFT_BOOST = 1.55;
/** Tall blades right up to the neon tube foot — no clearance hole at the tube. */
export const GRASS_TUBE_LOCAL = Object.freeze({
  x: (BUST_NEON_XZ.x - GRASS_POS.x) / GRASS_XZ_SCALE,
  z: (BUST_NEON_XZ.z - GRASS_POS.z) / GRASS_XZ_SCALE
});
export const GRASS_TUBE_TUFT_INNER_M = 0.2 / GRASS_XZ_SCALE;
export const GRASS_TUBE_TUFT_OUTER_M = 1.15 / GRASS_XZ_SCALE;
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
  neonColors: ["#9dff1a", "#00e5ff"],
  desc: "Arrival stop — bust, apple tree, and lawn patch."
};

/**
 * Arrival stop — bust + apple tree on a soft-edged lawn patch (neon tube shares the patch).
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
    this.bustRoot = null;
    this.appleRoot = null;
    this.grassRoot = null;
    /** @deprecated alias — stop-0 tree is apple */
    this.mapleRoot = null;
    this._modelLoadStarted = false;
    this._modelLoadSettled = false;

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
    const [bustResult, appleResult, grassResult] = await Promise.allSettled([
      loader.loadAsync(BUST_URL),
      loader.loadAsync(APPLE_URL),
      loader.loadAsync(GRASS_URL)
    ]);

    if (grassResult.status === "fulfilled") {
      this._mountGrass(grassResult.value.scene);
    } else {
      console.warn("[BustVignette] Failed to load lawn grass.", grassResult.reason);
    }

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
    if (this.bustRoot || this.appleRoot || this.grassRoot) {
      this.onAligned?.();
    }
  }

  /**
   * Soft lawn under bust / apple / neon — vignettes out to the plain stage floor.
   * @param {THREE.Object3D} scene
   */
  _mountGrass(scene) {
    if (this.grassRoot) return;

    const root = scene;
    root.name = "lawn-grass-stump";
    root.scale.set(GRASS_XZ_SCALE, GRASS_HEIGHT_SCALE, GRASS_XZ_SCALE);
    root.position.set(GRASS_POS.x, GRASS_Y, GRASS_POS.z);
    root.updateMatrixWorld(true);
    this._reseatBottom(root);
    // Keep a hair above the MeshBasic apron after seat (avoids under-floor flash).
    root.position.y = Math.max(root.position.y, GRASS_Y);
    this._hardenGrassMaterials(root);

    this.group.add(root);
    this.grassRoot = root;
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
    this._hardenBustMaterials(root);

    this.group.add(root);
    this.bustRoot = root;
  }

  /**
   * @param {THREE.Object3D} scene
   */
  _mountApple(scene) {
    if (this.appleRoot) return;

    const root = scene;
    root.name = "apple-tree";
    this._scaleSeat(root, APPLE_HEIGHT);
    root.rotation.y = THREE.MathUtils.degToRad(APPLE_YAW_DEG);
    root.position.x = APPLE_POS.x;
    root.position.z = APPLE_POS.z;
    root.updateMatrixWorld(true);
    this._reseatBottom(root);
    this._tagMeshes(root);
    this._smoothTreeShading(root);
    // Parent before material harden so canopy AABB / neon are world-correct.
    this.group.add(root);
    this.appleRoot = root;
    this.mapleRoot = root;
    this.group.updateMatrixWorld(true);
    this._hardenTreeMaterials(root);
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
   * Soft-edge lawn: blades shorten + fade toward the rim; ground FrontSide only
   * so the under-apron doesn’t flash through the MeshBasic floor.
   * @param {THREE.Object3D} root
   */
  _hardenGrassMaterials(root) {
    const maxAniso = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
    const fadeStart = GRASS_FADE_START.toFixed(3);
    const fadeEnd = GRASS_FADE_END.toFixed(3);
    const radius = GRASS_RADIUS.toFixed(3);
    const bustX = GRASS_BUST_LOCAL.x.toFixed(3);
    const bustZ = GRASS_BUST_LOCAL.z.toFixed(3);
    const treeX = GRASS_TREE_LOCAL.x.toFixed(3);
    const treeZ = GRASS_TREE_LOCAL.z.toFixed(3);
    const bustClear = GRASS_BUST_CLEAR_M.toFixed(3);
    const bustClearFeather = GRASS_BUST_CLEAR_FEATHER_M.toFixed(3);
    const bustPeak = GRASS_BUST_RING_PEAK_M.toFixed(3);
    const bustOuter = GRASS_BUST_RING_OUTER_M.toFixed(3);
    const bustBoost = GRASS_BUST_HEIGHT_BOOST.toFixed(3);
    const treeInner = GRASS_TREE_TUFT_INNER_M.toFixed(3);
    const treeOuter = GRASS_TREE_TUFT_OUTER_M.toFixed(3);
    const treeBoost = GRASS_TREE_TUFT_BOOST.toFixed(3);
    const tubeX = GRASS_TUBE_LOCAL.x.toFixed(3);
    const tubeZ = GRASS_TUBE_LOCAL.z.toFixed(3);
    const tubeInner = GRASS_TUBE_TUFT_INNER_M.toFixed(3);
    const tubeOuter = GRASS_TUBE_TUFT_OUTER_M.toFixed(3);
    const tubeBoost = GRASS_TUBE_TUFT_BOOST.toFixed(3);

    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = true;
      obj.renderOrder = -1;

      const name = `${obj.name} ${obj.material?.name ?? ""}`.toLowerCase();
      const ground = name.includes("ground");
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = [];

      for (const mat of mats) {
        if (!mat) {
          next.push(mat);
          continue;
        }

        let lit = mat;
        if (!mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
          lit = new THREE.MeshStandardMaterial({
            map: mat.map ?? null,
            alphaMap: mat.alphaMap ?? null,
            color: mat.color?.clone?.() ?? new THREE.Color(0xffffff),
            side: ground ? THREE.FrontSide : THREE.DoubleSide,
            transparent: !ground,
            opacity: 1,
            alphaTest: ground ? 0.12 : 0.12,
            depthWrite: true,
            metalness: 0,
            roughness: ground ? 0.94 : 0.82,
            envMapIntensity: 0
          });
          if ("alphaToCoverage" in lit) lit.alphaToCoverage = true;
          mat.dispose?.();
        }

        lit.side = ground ? THREE.FrontSide : THREE.DoubleSide;
        // Blades blend out at the rim; ground stays cutout against the apron.
        lit.transparent = !ground;
        lit.depthWrite = true;
        lit.metalness = 0;
        lit.roughness = Math.max(lit.roughness ?? 0.8, ground ? 0.94 : 0.82);
        lit.envMapIntensity = 0;
        lit.alphaTest = ground ? 0.12 : 0.12;
        if ("alphaToCoverage" in lit) lit.alphaToCoverage = Boolean(ground);
        if (lit.normalMap) lit.normalMap = null;
        if ("transmission" in lit) lit.transmission = 0;

        if (ground) {
          lit.polygonOffset = true;
          lit.polygonOffsetFactor = 1;
          lit.polygonOffsetUnits = 1;
        }

        for (const tex of [lit.map, lit.alphaMap]) {
          if (!tex) continue;
          // Mipmapped alpha cutouts stair-step into squares — keep sharp mips.
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = Math.min(16, maxAniso);
          tex.colorSpace = ground ? THREE.SRGBColorSpace : THREE.SRGBColorSpace;
          tex.needsUpdate = true;
        }

        if (!lit.userData.__grassEdgeFade) {
          lit.userData.__grassEdgeFade = true;
          const prevKey = lit.customProgramCacheKey?.bind(lit);
          lit.customProgramCacheKey = () =>
            `${prevKey?.() ?? lit.uuid}:grass-tufts:v5:${radius}:${fadeStart}:${fadeEnd}:${bustClear}:${bustBoost}:${treeBoost}:${tubeBoost}:${ground ? 1 : 0}`;
          const prevCompile = lit.onBeforeCompile?.bind(lit);
          const heightBoostGlsl = ground
            ? `vec2 bustDelta = position.xz - vec2(${bustX}, ${bustZ});
float bustDist = length(bustDelta);
float bustClearMask = smoothstep(${bustClear}, ${bustClear} + ${bustClearFeather}, bustDist);
float heightMul = bustClearMask;`
            : `vec2 bustDelta = position.xz - vec2(${bustX}, ${bustZ});
float bustDist = length(bustDelta);
// Hard clearance under the bust pedestal — no blades through the base.
float bustClearMask = smoothstep(${bustClear}, ${bustClear} + ${bustClearFeather}, bustDist);
float bustRing = smoothstep(${bustClear} + ${bustClearFeather}, ${bustPeak}, bustDist)
  * smoothstep(${bustOuter}, ${bustPeak}, bustDist);
vec2 treeDelta = position.xz - vec2(${treeX}, ${treeZ});
float treeDist = length(treeDelta);
float treeTuft = smoothstep(${treeOuter}, ${treeInner}, treeDist);
vec2 tubeDelta = position.xz - vec2(${tubeX}, ${tubeZ});
float tubeDist = length(tubeDelta);
// Grow right up to the tube foot — no clearance hole at the neon.
float tubeTuft = smoothstep(${tubeOuter}, ${tubeInner}, tubeDist);
float tuftNoise = 0.65 + 0.35 * sin(position.x * 7.3 + position.z * 5.1);
float heightMul = bustClearMask * (
  1.0
  + ${bustBoost} * bustRing
  + ${treeBoost} * treeTuft * tuftNoise
  + ${tubeBoost} * tubeTuft * tuftNoise
);`;
          lit.onBeforeCompile = (shader) => {
            prevCompile?.(shader);
            shader.vertexShader = shader.vertexShader
              .replace(
                "#include <common>",
                `#include <common>
varying float vGrassEdge;
varying float vGrassWorldY;
varying float vBustClear;`
              )
              .replace(
                "#include <begin_vertex>",
                `#include <begin_vertex>
// Match export irregular_radius() — organic rim, not a perfect circle.
float grassAng = atan(position.z, position.x);
float grassWobble =
  0.055 * sin(3.0 * grassAng + 0.40)
  + 0.04 * sin(5.0 * grassAng - 1.10)
  + 0.025 * sin(7.0 * grassAng + 2.30)
  + 0.02 * sin(2.0 * grassAng + 0.85);
float grassRim = ${radius} * clamp(1.0 + grassWobble, 0.93, 1.06);
float grassR = length(position.xz) / max(grassRim, 1e-4);
// Patchy rim — multi-octave noise so the edge dies in irregular lobes (not a disc).
float rimNoise =
  0.38
  + 0.28 * sin(position.x * 1.85 + position.z * 2.4)
  + 0.24 * sin(position.x * 3.9 - position.z * 3.2 + 1.3)
  + 0.22 * sin(position.x * 7.6 + position.z * 6.1 - 0.9)
  + 0.16 * sin(position.x * 13.2 - position.z * 11.0 + 2.1);
rimNoise = clamp(rimNoise, 0.02, 1.0);
float localFadeEnd = mix(${fadeStart} + 0.04, ${fadeEnd} * 0.88, pow(rimNoise, 0.7));
float edgeLin = smoothstep(localFadeEnd, ${fadeStart} * (0.55 + 0.45 * rimNoise), grassR);
vGrassEdge = pow(max(edgeLin * rimNoise, 0.0), 1.25);
${heightBoostGlsl}
vBustClear = bustClearMask;
transformed.y *= vGrassEdge * heightMul;`
              )
              .replace(
                "#include <project_vertex>",
                `#include <project_vertex>
vGrassWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`
              );
            shader.fragmentShader = shader.fragmentShader
              .replace(
                "#include <common>",
                `#include <common>
varying float vGrassEdge;
varying float vGrassWorldY;
varying float vBustClear;`
              )
              .replace(
                "#include <alphamap_fragment>",
                `#include <alphamap_fragment>
if (vGrassWorldY < -0.002) discard;
if (vBustClear < 0.04) discard;
if (vGrassEdge < 0.012) discard;
diffuseColor.a *= smoothstep(0.012, 0.38, vGrassEdge) * smoothstep(0.04, 0.55, vBustClear);
if (diffuseColor.a < 0.025) discard;`
              );
          };
        }

        lit.needsUpdate = true;
        next.push(lit);
      }

      obj.material = next.length === 1 ? next[0] : next;
    });
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

  /** Stone/bronze bust — GLB often ships metalness 1 (chrome under IBL). */
  _hardenBustMaterials(root) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (typeof mat.metalness === "number") mat.metalness = Math.min(mat.metalness, 0.12);
        if (typeof mat.roughness === "number") mat.roughness = Math.max(mat.roughness, 0.55);
        mat.envMapIntensity = 0.06;
        mat.needsUpdate = true;
      }
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
      NEON_LIGHT_HEIGHT,
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
