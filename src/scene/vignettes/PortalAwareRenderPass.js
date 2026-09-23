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
    const target = this.renderToScreen ? null : inputBuffer;
    this.portal?.renderPortalSubpass?.(renderer, this.camera, target);
  }
}
