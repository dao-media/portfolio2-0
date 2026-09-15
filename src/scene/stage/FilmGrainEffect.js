import { Uniform } from "three";
import { BlendFunction, Effect } from "postprocessing";

/**
 * Existing stage grain, ported to a postprocessing Effect so it can stay last
 * in the live composer (after bloom).
 */
export class FilmGrainEffect extends Effect {
  /**
   * @param {{ grain?: number }} [options]
   */
  constructor({ grain = 0 } = {}) {
    super(
      "FilmGrainEffect",
      `
        uniform float uTime;
        uniform float uGrain;

        float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          float g = (rand(uv * (uTime + 1.0)) - 0.5) * uGrain;
          outputColor = vec4(inputColor.rgb + g, inputColor.a);
        }
      `,
      {
        blendFunction: BlendFunction.SET,
        uniforms: new Map([
          ["uTime", new Uniform(0)],
          ["uGrain", new Uniform(grain)]
        ])
      }
    );
  }
}
