// main.js
import * as THREE from 'three';
import gsap from 'gsap';

import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NRRDLoader } from 'three/examples/jsm/loaders/NRRDLoader.js';
import { Sky } from './sky.js';
import cloudVertexShader from './shaders/clouds/cloudVertex.glsl';
import cloudFragmentShader from './shaders/clouds/cloudFragment.glsl';
import atmVertexShader from './shaders/atm/atmVertex.glsl';
import atmFragmentShader from './shaders/atm/atmFragment.glsl';
import { oscTriangle } from 'three/webgpu';

let container, stats;
let camera, controls, scene, renderer;
let cloudModel, satModel, imagePlane, clipPlane, ground, atm;
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

const satelliteFile = './CloudSat.glb';

console.log(`loading model: ${modelFile}`);
console.log(`model dimension: ${modelDim}`);

const defaultPointSize = 2.0;
const initOffset = 3.5;
const initSatScale = 0.04;
const groundSize = 100; // for spherical ground
const groundPosition = new THREE.Vector3(0, -100, 0);

await init();

async function init() {

    container = document.createElement('div');
    document.body.appendChild(container);

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 5000);
    camera.position.set(0, 2, 0);
    //camera.rotation.set(-Math.PI / 2.0, 0, 0);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.localClippingEnabled = false;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 5);
    scene.add(ambientLight);
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x083471, 2);
    scene.add(hemisphereLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 10);
    dirLight.position.set(-10, 10, 0);
    dirLight.rotation.set(0, 0, 3 * Math.PI / 4);
    scene.add(dirLight);

    stats = new Stats();
    container.appendChild(stats.dom);

    controls = new OrbitControls(camera, renderer.domElement);


    if (useGltf) {
        await loadGLTF(modelFile).then(() => {
            fitCameraToObject(camera, cloudModel, initOffset);
            camera.lookAt(cloudModel);
            renderer.setAnimationLoop(animate);
        });
    } else {
        await loadNRRD(modelFile).then(() => {
            fitCameraToObject(camera, cloudModel, initOffset);
            camera.lookAt(cloudModel);
            renderer.setAnimationLoop(animate);
        });
    }

    await loadSatellite(satelliteFile);

    //await initSky().then(() => {
    //    initGUI();
    //});

    const textureLoader = new THREE.TextureLoader();
    const planeGeo = new THREE.PlaneGeometry(1, 1);
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
        imagePlane = new THREE.Mesh(planeGeo, plane_mat);
        imagePlane.rotation.set(-Math.PI / 2.0, 0.0, 0.0);
        scene.add(imagePlane);
        controls.target = imagePlane.position;
    });

    const groundGeo = new THREE.SphereGeometry(groundSize, 128, 128);
    const atmGeo = new THREE.SphereGeometry(groundSize * 1.005, 128, 128);
    const groundMat = new THREE.MeshPhongMaterial({
        color: 0x083471
    });
    const atmMat = new THREE.ShaderMaterial({
        vertexShader: atmVertexShader,
        fragmentShader: atmFragmentShader,
        uniforms: {
            uDayColor: new THREE.Uniform(new THREE.Color(0x00b5e2)),
            uAtmFalloff: new THREE.Uniform(0.1)
        },
        side: THREE.BackSide,
        transparent: true
    });
    ground = new THREE.Mesh(groundGeo, groundMat);
    atm = new THREE.Mesh(atmGeo, atmMat);
    scene.add(ground);
    scene.add(atm);
    //ground.rotation.x = -Math.PI / 2.0;
    ground.position.copy(groundPosition);
    atm.position.copy(groundPosition);

    initGUI();

    window.addEventListener('resize', onWindowResize, false);
}

async function loadGLTF(modelName) {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(modelName, function (gltf) {
            clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.4);
            cloudModel = gltf.scene;
            cloudModel.traverse((node) => {
                if (node instanceof THREE.Points) {
                    node.material = createPointCloudMaterial();
                }
            });
            cloudModel.scale.set(1 / modelDim, 1 / modelDim, 1 / modelDim);
            cloudModel.position.x -= 0.5;
            cloudModel.position.z -= 0.5;
            cloudModel.scale.z *= -1.0;
            //model.rotation.x = Math.PI;
            //model.rotation.z = Math.PI;
            scene.add(cloudModel);
            resolve();
        }, undefined, function (error) {
            console.error(`Failed to load point cloud model: ${error}`);
            reject(error);
        });
    });
}

async function loadSatellite(modelName) {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(modelName, function (glb) {
            satModel = glb.scene;
            satModel.position.y = 0.75;
            satModel.rotation.y = 0.15 * Math.PI;
            satModel.scale.set(initSatScale, initSatScale, initSatScale);
            scene.add(satModel);
            resolve();
        }, undefined, function (error) {
            console.error(`Failed to load satellite model: ${error}`);
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
                    uBase: { value: new THREE.Color(0x798aa0) },
                    uMap: { value: texture },
                    uCameraPos: { value: new THREE.Vector3() },
                    uThreshold: { value: 0.01 },
                    uOpacity: { value: 1.0 },
                    uRange: { value: 0.0 },
                    uSteps: { value: 200 },
                    uFrame: { value: 0 }
                },
                vertexShader: cloudVertexShader,
                fragmentShader: cloudFragmentShader,
                side: THREE.BackSide,
                transparent: true,
                clipping: true,
                clippingPlanes: [clipPlane]
            });

            cloudModel = new THREE.Mesh(geometry, material);
            cloudModel.position.set(0, 0.6, 0);
            //cloudModel.position.set(0.375, 0.13, 0.375);
            //cloudModel.rotation.set(-Math.PI / 2.0, 0, 0);
            //cloudModel.scale.set(0.25, 0.25, 0.25);
            scene.add(cloudModel);
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

function positionPlane(phi, theta) {
    const planePosition = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)).multiplyScalar(groundSize);

    // This accounts for the -pi / 2 rotation on the x axis that the plane requires. Otherwise it will appear
    // perpendicular
    const up = new THREE.Vector3(0, 0, 1);
    const normal = new THREE.Vector3(planePosition.x, planePosition.y, planePosition.z).normalize();

    imagePlane.position.copy(planePosition.add(groundPosition));
    imagePlane.quaternion.setFromUnitVectors(up, normal);
    cloudModel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    satModel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    satModel.position.copy(imagePlane.position);
    satModel.position.y += 0.75;
    imagePlane.rotation.z = cloudModel.rotation.y;
    cloudModel.position.copy(planePosition.add(new THREE.Vector3(-0.5, 0, -0.5)));
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
            let imagePos;
            switch (propsClip.axis) {
                case 'X':
                    imagePos = imagePlane.position.x;
                    break;
                case 'Y':
                    imagePos = imagePlane.position.y;
                    break;
                case 'Z':
                    imagePos = imagePlane.position.z;
                    break;
            }
            clipPlane.constant = imagePos + v;
        },
    };
    folderClip.add(propsClip, 'enabled');
    folderClip.add(propsClip, 'axis', ['X', 'Y', 'Z']);
    folderClip.add(propsClip, 'planePosition', -1.0, 1.0, 0.01);

    /*
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
    */

    const folderCloud = gui.addFolder('Cloud Parameters');
    if (useGltf) {
        const propsCloud = {
            scale: defaultPointSize,
            posY: 0.0,
            rotY: 0.0
        };

        function cloudsChanged() {
            cloudModel.traverse((node) => {
                if (node instanceof THREE.Points) {
                    const uniforms = node.material.uniforms;
                    uniforms['uScale'].value = propsCloud.scale;
                    cloudModel.position.y = imagePlane.position.y + propsCloud.posY;
                }
            });
        }
        folderCloud.add(propsCloud, 'scale', 0.1, 10, 0.1).onChange(cloudsChanged);
        folderCloud.add(propsCloud, 'posY', -0.2, 0.2, 0.01).onChange(cloudsChanged);
        folderCloud.add(propsCloud, 'rotY', 0, Math.PI, 0.01).onChange(() => {
            imagePlane.rotation.z = -propsCloud.rotY;
            cloudModel.rotation.y = propsCloud.rotY;
        });
    } else {
        const propsCloud = {
            qcThreshold: 1.0,
            opacity: 100.0,
            range: 0.0,
            raymarchSteps: 200
        };

        function cloudsChanged() {
            const uniforms = cloudModel.material.uniforms;
            uniforms['uThreshold'].value = propsCloud.qcThreshold / 100.0;
            uniforms['uOpacity'].value = propsCloud.opacity / 100.0;
            uniforms['uRange'].value = propsCloud.range;
            uniforms['uSteps'].value = propsCloud.raymarchSteps;
        }

        folderCloud.add(propsCloud, 'qcThreshold', 0, 100, 0.1).onChange(cloudsChanged);
        folderCloud.add(propsCloud, 'opacity', 0, 100, 0.1).onChange(cloudsChanged);
        folderCloud.add(propsCloud, 'range', 0, 1, 0.01).onChange(cloudsChanged);
        folderCloud.add(propsCloud, 'raymarchSteps', 0, 500, 1).onChange(cloudsChanged);
    }

    const folderMisc = gui.addFolder('Misc Parameters');
    const propsMisc = {
        modelOffset: initOffset,
        modelPhi: 0,
        modelTheta: 0,
        satScale: initSatScale,
        satRotY: 0.2 * Math.PI,
        atmFalloff: 0.1,
        atmColor: 0x00b5e2
    }
    folderMisc.add(propsMisc, 'modelOffset', 1, 20, 0.01).onChange(() => {
        fitCameraToObject(camera, cloudModel, propsMisc.modelOffset);
        controls.update();
    });
    folderMisc.add(propsMisc, 'modelPhi', -Math.PI / 8, Math.PI / 8, 0.001).onChange(() => {
        positionPlane(propsMisc.modelPhi, propsMisc.modelTheta);
        controls.target = imagePlane.position;
        fitCameraToObject(camera, cloudModel, propsMisc.modelOffset);
        controls.update();
    });
    folderMisc.add(propsMisc, 'modelTheta', -Math.PI / 4, Math.PI / 4, 0.01).onChange(() => {
        positionPlane(propsMisc.modelPhi, propsMisc.modelTheta);
        controls.target = imagePlane.position;
        fitCameraToObject(camera, cloudModel, propsMisc.modelOffset);
        controls.update();
    });
    folderMisc.add(propsMisc, 'satScale', 0, 0.2, 0.001).onChange(() => {
        satModel.scale.set(propsMisc.satScale, propsMisc.satScale, propsMisc.satScale);
    });
    folderMisc.add(propsMisc, 'satRotY', -Math.PI, Math.PI, 0.01).onChange(() => {
        satModel.rotation.y = propsMisc.satRotY;
    });
    folderMisc.add(propsMisc, 'atmFalloff', 0.1, 5, 0.005).onChange(() => {
        const uniforms = atm.material.uniforms;
        uniforms['uAtmFalloff'].value = propsMisc.atmFalloff;
    });
    folderMisc.addColor(propsMisc, 'atmColor').onChange(() => {
        atm.material.uniforms.uDayColor.value.set(propsMisc.atmColor);
    });
}

function fitCameraToObject(camera, object, offset) {

    offset = offset || 1.25;

    const boundingBox = new THREE.Box3();

    // get bounding box of object - this will be used to setup controls and camera
    boundingBox.setFromObject(object);

    const dummy = new THREE.Vector3();
    const size = boundingBox.getSize(dummy);

    // get the max side of the bounding box (fits to width OR height as needed )
    const maxDim = Math.max(size.x, size.y, size.z);
    let cameraZ = Math.abs(maxDim / 4 * Math.tan(camera.fov * 2));
    cameraZ *= offset;

    // zoom out a little so that objects don't fill the screen
    camera.position.x = -cameraZ + object.position.x;
    camera.position.y = 0.4 * cameraZ + object.position.y;
    camera.position.z = cameraZ + object.position.z;

    // const minZ = boundingBox.min.z;
    // const cameraToFarEdge = (minZ < 0) ? -minZ + cameraZ : cameraZ - minZ;

    // camera.far = cameraToFarEdge * 1000;
    camera.updateProjectionMatrix();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    if (!useGltf) {
        cloudModel.material.uniforms.uCameraPos.value.copy(camera.position);
    }
    controls.update();

    stats.begin();
    renderer.render(scene, camera);
    stats.end();
}
