/**
 * Shared LoadingManager + fog bake + min boot duration.
 * Interaction stays locked until all three clear.
 */
export function createStageLoadGate({
  manager,
  bootSequence,
  renderer,
  scene,
  camera,
  post,
  fogMaterial,
  bakeFogAtlas,
  bootMinMs = 2600,
  onReady
}) {
  let assetsReady = false;
  let ready = false;
  let seeding = true;
  const bootStart = performance.now();

  const finalize = () => {
    if (!assetsReady || ready) return;

    fogMaterial.uniforms.uFogAtlas.value = bakeFogAtlas(renderer);
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
    if (seeding) return;
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
