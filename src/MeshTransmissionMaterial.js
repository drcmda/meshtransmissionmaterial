/** Original material by @ore_ukonpower and http://next.junni.co.jp
 *  https://github.com/junni-inc/next.junni.co.jp/blob/master/src/ts/MainScene/World/Sections/Section2/Transparents/Transparent/shaders/transparent.fs
 */

import * as THREE from 'three'
import * as React from 'react'
import { extend, useThree, useFrame, ReactThreeFiber } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'


class MeshTransmissionMaterialImpl extends THREE.MeshPhysicalMaterial {
  constructor({ samples = 5, ...args } = {}) {
    super(args)

    this.uniforms = {
      refraction: { value: 0 },
      rgbShift: { value: 0.3 },
      noise: { value: 0.03 },
      saturation: { value: 1.0 },
      contrast: { value: 1.0 },
      buffer: { value: null },
      refractionColor: { value: new THREE.Color('black') },
      resolution: { value: new THREE.Vector2() }
    }

    this.onBeforeCompile = (shader) => {
      shader.uniforms = {
        ...shader.uniforms,
        ...this.uniforms
      }

      // Head
      shader.fragmentShader =
        `uniform float rgbShift;
      uniform vec2 resolution;
      uniform vec3 refractionColor;
      uniform float refraction;
      uniform float noise;
      uniform float saturation;
      uniform float contrast;
      uniform sampler2D buffer;
      
      vec3 sat(vec3 rgb, float adjustment) {
        const vec3 W = vec3(0.2125, 0.7154, 0.0721);
        vec3 intensity = vec3(dot(rgb, W));
        return mix(intensity, rgb, adjustment);
      }\n` + shader.fragmentShader

      // Remove transmission
      shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_pars_fragment>', '')
      shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_fragment>', '')

      // Add refraction
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec2 refractNormal = vNormal.xy * (1.0 - vNormal.z * 0.85);
        vec3 refractCol = refractionColor;        
        float randomCoords = rand(uv);
        float slide;
        #pragma unroll_loop_start
        for (int i = 0; i < ${samples}; i ++) {
          slide = float(UNROLLED_LOOP_INDEX) / float(${samples}) * 0.1 + randomCoords * noise;              
          refractCol.r += texture2D(buffer, uv - refractNormal * (refraction + slide * 1.0) * rgbShift).r;
          refractCol.g += texture2D(buffer, uv - refractNormal * (refraction + slide * 2.0) * rgbShift).g;
          refractCol.b += texture2D(buffer, uv - refractNormal * (refraction + slide * 3.0) * rgbShift).b;
          refractCol = sat(refractCol, saturation);
        }
        #pragma unroll_loop_end
        refractCol /= float(${samples});
        vec3 outgoingLight = (refractCol * totalDiffuse * contrast) + totalSpecular + totalEmissiveRadiance;`
      )
    }

    Object.keys(this.uniforms).forEach((name) =>
      Object.defineProperty(this, name, {
        get: () => this.uniforms[name].value,
        set: (v) => (this.uniforms[name].value = v)
      })
    )
  }
}

export const MeshTransmissionMaterial = React.forwardRef(
  ({ buffer, samples = 10, resolution = 1024, background, ...props }, fref) => {
    extend({ MeshTransmissionMaterial: MeshTransmissionMaterialImpl })

    const ref = React.useRef(null)
    const { size, viewport } = useThree()
    const fbo = useFBO(resolution)
    const config = React.useMemo(() => ({ samples }), [samples])

    let oldBg
    let oldVis
    let parent
    useFrame((state) => {
      if (!buffer) {
        parent = ref.current.__r3f.parent
        if (parent) {
          // Hide the outer groups contents
          oldVis = parent.visible
          parent.visible = false
          // Set render target to the local buffer
          state.gl.setRenderTarget(fbo)
          // Save the current background and set the HDR as the new BG
          // This is what creates the reflections
          oldBg = state.scene.background
          if (background) state.scene.background = background
          // Render into the buffer
          state.gl.render(state.scene, state.camera)
          // Set old state back
          state.scene.background = oldBg
          state.gl.setRenderTarget(null)
          parent.visible = oldVis
        }
      }
    })

    // Forward ref
    React.useImperativeHandle(fref, () => ref.current, [])

    return (
      <meshTransmissionMaterial
        args={[config]}
        ref={ref}
        buffer={buffer || fbo.texture}
        resolution={[size.width * viewport.dpr, size.height * viewport.dpr]}
        {...props}
      />
    )
  }
)
