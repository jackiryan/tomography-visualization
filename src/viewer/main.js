// main.js
import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NRRDLoader } from 'three/examples/jsm/loaders/NRRDLoader.js';
import { Sky } from './sky.js';
import cloudVertexShader from './shaders/clouds/cloudVertex.glsl';
import cloudFragmentShader from './shaders/clouds/cloudFragment.glsl';


let container, stats;
let camera, controls, scene, renderer;
let model, image_plane, clipPlane, ground;
let sky, sun;

const useGltf = true;
const useBigModel = true;

let modelDim = 400;
if (useBigModel) {
    modelDim = 2048;
}

let baseName = './ARM_28800s_QC';
if (useBigModel) {
    baseName = './RICO_40m_80kmx80km_QC';
}
let modelFile = `${baseName}.nrrd`;

if (useGltf) {
    modelFile = `${baseName}.gltf`;
}

console.log(`loading model: ${modelFile}`);
console.log(`model dimension: ${modelDim}`);

const defaultPointSize = 2.0;

await init();

async function init() {

    container = document.createElement('div');
    document.body.appendChild(container);

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 5000);
    camera.position.set(0, 1, 0);
    camera.rotation.set(-Math.PI / 2.0, 0, 0);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.localClippingEnabled = false;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 10);
    scene.add(ambientLight);

    stats = new Stats();
    container.appendChild(stats.dom);

    controls = new OrbitControls(camera, renderer.domElement);

    if (useGltf) {
        await loadGLTF(modelFile).then(() => {
            renderer.setAnimationLoop(animate);
        });
    } else {
        await loadNRRD(modelFile).then(() => {
            renderer.setAnimationLoop(animate);
        });
    }

    await initSky().then(() => {
        initGUI();
    });

    const textureLoader = new THREE.TextureLoader();
    const plane_geo = new THREE.PlaneGeometry(1, 1);
    textureLoader.load('./MISR_40m_radiance_nadir_2048x2048.png', function (texture) {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.x = 1;
        texture.repeat.y = 1;
        texture.needsUpdate = true;
        const plane_mat = new THREE.MeshPhongMaterial({
            map: texture,
            side: THREE.DoubleSide
        });
        image_plane = new THREE.Mesh(plane_geo, plane_mat);
        image_plane.rotation.set(-Math.PI / 2.0, 0.0, 0.0);
        scene.add(image_plane);
    });

    const ground_size = 1000; // for spherical ground
    const ground_geo = new THREE.PlaneGeometry(ground_size, ground_size);
    const ground_mat = new THREE.MeshPhongMaterial({
        color: 0x083471
    });
    ground = new THREE.Mesh(ground_geo, ground_mat);
    scene.add(ground);
    ground.rotation.x = -Math.PI / 2.0;
    ground.position.set(0, -0.01, 0);

    window.addEventListener('resize', onWindowResize, false);
}

async function loadGLTF(modelName) {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(modelName, function (gltf) {
            clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.4);
            model = gltf.scene;
            model.traverse((node) => {
                if (node instanceof THREE.Points) {
                    node.material = createPointCloudMaterial();
                }
            });
            model.scale.set(1 / modelDim, 1 / modelDim, 1 / modelDim);
            model.position.x -= 0.5;
            model.position.z -= 0.5;
            model.scale.z *= -1.0;
            //model.rotation.x = Math.PI;
            //model.rotation.z = Math.PI;
            scene.add(model);
            resolve();
        }, undefined, function (error) {
            console.error(`Failed to load point cloud model: ${error}`);
            reject(error);
        });
    });
}

async function loadNRRD(modelName) {
    return new Promise((resolve, reject) => {
        new NRRDLoader().load(modelName, async function (volume) {
            clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.4);

            const texture = new THREE.Data3DTexture(volume.data, volume.xLength, volume.yLength, volume.zLength);
            texture.format = THREE.RedFormat;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.needsUpdate = true;

            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.RawShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    base: { value: new THREE.Color(0x798aa0) },
                    map: { value: texture },
                    cameraPos: { value: new THREE.Vector3() },
                    threshold: { value: 0.01 },
                    opacity: { value: 1.0 },
                    range: { value: 0.0 },
                    steps: { value: 200 },
                    frame: { value: 0 }
                },
                vertexShader: cloudVertexShader,
                fragmentShader: cloudFragmentShader,
                side: THREE.BackSide,
                transparent: true,
                clipping: true,
                clippingPlanes: [clipPlane]
            });

            model = new THREE.Mesh(geometry, material);
            model.position.set(0.375, 0.13, 0.375);
            model.rotation.set(-Math.PI / 2.0, 0, 0);
            model.scale.set(0.25, 0.25, 0.25);
            scene.add(model);
            resolve();
        }, undefined, function (error) {
            console.error(`Failed to load point cloud data: ${error}`);
            reject(error);
        });
    });
}

async function initSky() {
    return new Promise((resolve, reject) => {
        new THREE.TextureLoader().load('./starmap_2020_4k.avif', function (texture) {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            sky = new Sky(texture);
            sky.scale.setScalar(450000);
            scene.add(sky);
            sun = new THREE.Vector3();
            resolve();
        }, undefined, function (error) {
            console.error(`Failed to load sky: ${error}`);
            reject(error);
        });
    });
}

function createPointCloudMaterial() {
    const vertexShader = `
        #if NUM_CLIPPING_PLANES > 0 && ! defined(PHYSICAL) && ! defined(PHONG)
	        out vec3 vViewPosition;
        #endif

        uniform float uScale;
        
        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            // increasing the numerator increases the size of the points
            gl_PointSize = uScale / -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;
            #if NUM_CLIPPING_PLANES > 0 && ! defined(PHYSICAL) && ! defined(PHONG)
                vViewPosition = -mvPosition.xyz;
            #endif
        }
    `;

    const fragmentShader = `
        #if NUM_CLIPPING_PLANES > 0

            #if ! defined(PHYSICAL) && ! defined(PHONG)
                in vec3 vViewPosition;
            #endif

            uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];

        #endif

        out vec4 color;

        void main() {
            #if NUM_CLIPPING_PLANES > 0
                #pragma unroll_loop_start
                for (int i = 0; i < UNION_CLIPPING_PLANES; ++i) {
                    vec4 plane = clippingPlanes[i];
                    if (dot(vViewPosition, plane.xyz) > plane.w) {
                        discard;
                    }
                }
                #pragma unroll_loop_end
                
                #if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
                    bool clipped = true;
                    #pragma unroll_loop_start
                    for (int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; ++ i) {
                        vec4 plane = clippingPlanes[ i ];
                        clipped = (dot(vViewPosition, plane.xyz) > plane.w) && clipped;
                    }
                    #pragma unroll_loop_end

                    if (clipped) {
                        discard;
                    }
                #endif
            #endif

            vec4 diffuseColor = vec4(1.0, 1.0, 1.0, 1.0);
            color = diffuseColor;
        }
    `;

    const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            'uScale': { value: defaultPointSize }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        clipping: true,
        clippingPlanes: [clipPlane]
    });

    return material;
}

function initGUI() {
    const gui = new GUI();
    const folderClip = gui.addFolder('Clip Plane');
    const propsClip = {
        get 'enabled'() {
            return renderer.localClippingEnabled;
        },
        set 'enabled'(v) {
            renderer.localClippingEnabled = v;
        },
        get 'axis'() {
            if (clipPlane.normal.x === -1) {
                return 'X';
            }
            else if (clipPlane.normal.y === -1) {
                return 'Y';
            }
            else if (clipPlane.normal.z === -1) {
                return 'Z';
            }
        },
        set 'axis'(v) {
            switch (v) {
                case 'X':
                    clipPlane.normal.set(-1, 0, 0);
                    break;
                case 'Y':
                    clipPlane.normal.set(0, -1, 0);
                    break;
                case 'Z':
                    clipPlane.normal.set(0, 0, -1);
                    break;
            }
        },
        get 'planePosition'() {
            return clipPlane.constant;
        },
        set 'planePosition'(v) {
            clipPlane.constant = v;
        },
    };
    const folderSky = gui.addFolder('Sky Parameters');
    const propsSky = {
        turbidity: 0,
        rayleigh: 0.2,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.066,
        elevation: 33,
        azimuth: 180,
        exposure: renderer.toneMappingExposure,
        atmStart: -0.2,
        atmStop: 1
    };

    function skyChanged() {
        const uniforms = sky.material.uniforms;
        uniforms['turbidity'].value = propsSky.turbidity;
        uniforms['rayleigh'].value = propsSky.rayleigh;
        uniforms['mieCoefficient'].value = propsSky.mieCoefficient;
        uniforms['mieDirectionalG'].value = propsSky.mieDirectionalG;
        uniforms['uAtmStart'].value = propsSky.atmStart;
        uniforms['uAtmStop'].value = propsSky.atmStop;

        const phi = THREE.MathUtils.degToRad(90 - propsSky.elevation);
        const theta = THREE.MathUtils.degToRad(propsSky.azimuth);

        sun.setFromSphericalCoords(1, phi, theta);

        uniforms['sunPosition'].value.copy(sun);

        renderer.toneMappingExposure = propsSky.exposure;
        renderer.render(scene, camera);
    }

    folderClip.add(propsClip, 'enabled');
    folderClip.add(propsClip, 'axis', ['X', 'Y', 'Z']);
    folderClip.add(propsClip, 'planePosition', -1.0, 1.0, 0.01);

    const folderCloud = gui.addFolder('Cloud Parameters');
    if (useGltf) {
        const propsCloud = {
            scale: defaultPointSize,
            posY: 0.0
        }

        function cloudsChanged() {
            model.traverse((node) => {
                if (node instanceof THREE.Points) {
                    const uniforms = node.material.uniforms;
                    uniforms['uScale'].value = propsCloud.scale;
                    model.position.y = propsCloud.posY;
                }
            });
        }
        folderCloud.add(propsCloud, 'scale', 0.1, 10, 0.1).onChange(cloudsChanged);
        folderCloud.add(propsCloud, 'posY', 0.0, 0.5, 0.01).onChange(cloudsChanged);
    } else {
        const propsCloud = {
            qcThreshold: 1.0,
            opacity: 100.0,
            range: 0.0,
            raymarchSteps: 200
        }

        function cloudsChanged() {
            const uniforms = model.material.uniforms;
            uniforms['threshold'].value = propsCloud.qcThreshold / 100.0;
            uniforms['opacity'].value = propsCloud.opacity / 100.0;
            uniforms['range'].value = propsCloud.range;
            uniforms['steps'].value = propsCloud.raymarchSteps;
        }

        folderCloud.add(propsCloud, 'qcThreshold', 0, 100, 0.1).onChange(cloudsChanged);
        folderCloud.add(propsCloud, 'opacity', 0, 100, 0.1).onChange(cloudsChanged);
        folderCloud.add(propsCloud, 'range', 0, 1, 0.01).onChange(cloudsChanged);
        folderCloud.add(propsCloud, 'raymarchSteps', 0, 500, 1).onChange(cloudsChanged);
    }

    folderSky.add(propsSky, 'turbidity', 0.0, 20.0, 0.1).onChange(skyChanged);
    folderSky.add(propsSky, 'rayleigh', 0.0, 4, 0.001).onChange(skyChanged);
    folderSky.add(propsSky, 'mieCoefficient', 0.0, 0.1, 0.001).onChange(skyChanged);
    folderSky.add(propsSky, 'mieDirectionalG', 0.0, 1, 0.001).onChange(skyChanged);
    folderSky.add(propsSky, 'elevation', -10, 90, 0.1).onChange(skyChanged);
    folderSky.add(propsSky, 'azimuth', - 180, 180, 0.1).onChange(skyChanged);
    folderSky.add(propsSky, 'exposure', 0, 1, 0.0001).onChange(skyChanged);
    folderSky.add(propsSky, 'atmStart', -1, 1, 0.01).onChange(skyChanged);
    folderSky.add(propsSky, 'atmStop', -1, 1, 0.01).onChange(skyChanged);

    skyChanged();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    if (!useGltf) {
        model.material.uniforms.cameraPos.value.copy(camera.position);
    }
    controls.update();

    stats.begin();
    renderer.render(scene, camera);
    stats.end();
}
