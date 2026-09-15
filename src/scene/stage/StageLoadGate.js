/**
 * Shared LoadingManager + min boot duration.
 * Interaction stays locked until the *gating* set (PC maps + Desktop GLB)
 * plus min boot clear. Deferred GLBs (Sidekick, Travel/T-rex) must not
 * share this manager — a late onLoad would otherwise re-enter finalize.
 *
 * Fog atlas bake removed — volumetric fog needs no ring/haze atlas.
 */
export function createStageLoadGate({
  manager,
  bootSequence,
  renderer,
  scene,
  camera,
  post,
  bootMinMs = 2600,
  onReady
}) {
  let assetsReady = false;
  let ready = false;
  let seeding = true;
  /** Set the moment finalize starts so a second onLoad cannot unlock twice. */
  let committed = false;
  const bootStart = performance.now();

  const finalize = () => {
    if (!assetsReady || ready || committed) return;
    committed = true;

    renderer.compile(scene, camera);
    post?.warm?.();
    if (!post?._scene) {
      post?.render?.(scene, camera, 0, { grainStrength: 0 });
    }

    const wait = Math.max(0, bootMinMs - (performance.now() - bootStart));
    window.setTimeout(() => {
      ready = true;
      bootSequence.dismiss();
      onReady?.();
    }, wait);
  };

  manager.onProgress = (_url, loaded, total) => {
    bootSequence.setProgress(total > 0 ? loaded / total : 1);
  };

  manager.onLoad = () => {
    if (seeding || committed) return;
    assetsReady = true;
    finalize();
  };

  manager.onError = (url) => {
    console.warn("[StageLoadGate] Asset failed:", url);
  };

  return {
    /** Call after every loader has been kicked so a cached onLoad isn't dropped. */
    finishSeeding() {
      seeding = false;
      const total = manager.itemsTotal ?? 0;
      const loaded = manager.itemsLoaded ?? 0;
      if (total === 0 || loaded >= total) {
        assetsReady = true;
        finalize();
      }
    },
    get ready() {
      return ready;
    }
  };
}
