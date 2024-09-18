import {
    BackSide,
    GLSL3,
    Mesh,
    ShaderMaterial,
    SphereGeometry,
    Vector3
} from 'three';
import skyVertexShader from './shaders/sky/skyStarVertex.glsl';
import skyFragmentShader from './shaders/sky/skyStarFragment.glsl';

/**
 * Based on "A Practical Analytic Model for Daylight"
 * aka The Preetham Model, the de facto standard analytic skydome model
 * https://www.researchgate.net/publication/220720443_A_Practical_Analytic_Model_for_Daylight
 *
 * First implemented by Simon Wallner
 * http://simonwallner.at/project/atmospheric-scattering/
 *
 * Improved by Martin Upitis
 * http://blenderartists.org/forum/showthread.php?245954-preethams-sky-impementation-HDR
 *
 * Three.js integration by zz85 http://twitter.com/blurspline
*/

class Sky extends Mesh {
    constructor(nightTexture) {
        const uniforms = {
            'uNightTexture': { value: nightTexture },
            'turbidity': { value: 2 },
            'rayleigh': { value: 1 },
            'mieCoefficient': { value: 0.005 },
            'mieDirectionalG': { value: 0.8 },
            'sunPosition': { value: new Vector3() },
            'up': { value: new Vector3(0, 1, 0) },
            'uAtmStart': { value: -1.0 },
            'uAtmStop': { value: 1.0 }
        };

        const material = new ShaderMaterial({
            name: 'SkyShader',
            glslVersion: GLSL3,
            uniforms: uniforms,
            vertexShader: skyVertexShader,
            fragmentShader: skyFragmentShader,
            side: BackSide,
            depthWrite: false
        });

        super(new SphereGeometry(1, 32, 32), material);

        this.isSky = true;
    }
}

export { Sky };