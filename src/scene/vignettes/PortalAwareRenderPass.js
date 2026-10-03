import { RenderPass } from "postprocessing";

/**
 * Beauty RenderPass that can run an ArchPortal subpass after the arena draw.
 * Current Giza portal draws in the main beauty pass (clip corridor); subpass
 * is a no-op reserved if stencil returns.
 */
export class PortalAwareRenderPass extends RenderPass {
  /**
   * @param {import("three").Scene} scene
   * @param {import("three").Camera} camera
   */
  constructor(scene, camera) {
    super(scene, camera);
    /** @type {{ renderPortalSubpass?: Function } | null} */
    this.portal = null;
  }

  /**
   * @param {{ renderPortalSubpass?: Function } | null} portal
   */
  setPortal(portal) {
    this.portal = portal ?? null;
  }

  /**
   * @param {import("three").WebGLRenderer} renderer
   * @param {import("three").WebGLRenderTarget} inputBuffer
   * @param {import("three").WebGLRenderTarget} outputBuffer
   * @param {number} [deltaTime]
   * @param {boolean} [stencilTest]
   */
  render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) {
    super.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest);
    // Pass G — `renderer.info.render` resets on every individual
    // renderer.render() call; by the time a frame finishes (every later
    // postprocessing pass is its own such call, usually a 1-quad/2-triangle
    // fullscreen draw), whatever ran last is all `info.render.triangles`
    // still holds. This is the actual beauty draw of the real scene, so
    // capture the real count here, right after it, for the flight recorder.
    this.lastSceneTriangles = renderer.info.render.triangles;
    const target = this.renderToScreen ? null : inputBuffer;
    this.portal?.renderPortalSubpass?.(renderer, this.camera, target);
  }
}
