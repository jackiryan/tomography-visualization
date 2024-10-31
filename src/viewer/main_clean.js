import * as THREE from 'three';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import atmVertexShader from './shaders/atm/atmVertex.glsl';
import atmFragmentShader from './shaders/atm/atmFragment.glsl';
import oceanVertexShader from './shaders/ocean/oceanVertex.glsl';
import oceanFragmentShader from './shaders/ocean/oceanFragment.glsl';

let container, camera, controls, scene, renderer;
let cloudGroup, satModel, imagePlane, ground, atm;
let clipPlane, clipPlaneAxis;
let sky, keyLight, fillLight, orbitTrack;

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
const starTexture = './starmap_2020_8k.avif';
const planeTexture = './MISR_40m_radiance_nadir_2048x2048.png';

console.log(`loading model: ${modelFile}`);
console.log(`model dimension: ${modelDim}`);

const defaultPointSize = 2.0;
const initOffset = 1.25;
const initClipPos = -1.02;
const initClipDir = new THREE.Vector3(-1, 0, 0);
const groundSize = 100; // for spherical ground
const groundPosition = new THREE.Vector3(0, -100, 0);

const renderParms = {
    fps: 10,
    interval: 100,
    lastTime: 0
};

const initSatParms = {
    scale: 0.02,
    height: 0.4,
    spacing: 0.6
};

await init().then(() => {
    requestAnimationFrame(animate);
    initGUI();
});

async function init() {

    container = document.createElement('div');
    document.body.appendChild(container);

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 5000);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);

    renderer = new THREE.WebGLRenderer({
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 5);
    scene.add(ambientLight);
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x083471, 2);
    scene.add(hemisphereLight);
    keyLight = new THREE.DirectionalLight(0xffffff, 10);
    scene.add(keyLight);
    fillLight = new THREE.DirectionalLight(0xffffff, 10);
    scene.add(fillLight);

    controls = new OrbitControls(camera, renderer.domElement);

    if (useGltf) {
        await loadGLTF(modelFile);
    }

    await loadPlane(planeTexture).then(() => {
        const numCopies = 2;
        const planeGroup = new THREE.Group(); // Create a group to hold the clones

        const originalPlane = imagePlane.clone();
        originalPlane.children = [];

        for (let x = -numCopies; x <= numCopies; x++) {
            if (x === 0) continue; // Skip the original plane position

            const imPlaneClone = originalPlane.clone();
            imPlaneClone.material = imPlaneClone.material.clone();
            imPlaneClone.material.uniforms = THREE.UniformsUtils.clone(imPlaneClone.material.uniforms);

            // These values will highly depend on camera angle. These work well for the
            // default camera angle.
            if (x > 1) {
                imPlaneClone.material.uniforms.uThreshold.value = 0.3;
            } else if (x > 0) {
                imPlaneClone.material.uniforms.uThreshold.value = 0.2;
            } else {
                imPlaneClone.material.uniforms.uThreshold.value = 0.1;
            }

            console.log(`Radiance image at x = ${x}`);
            console.log(imPlaneClone.material.uniforms);

            imPlaneClone.position.x = x;
            imPlaneClone.rotation.x = Math.PI;

            planeGroup.add(imPlaneClone);
        }

        imagePlane.add(planeGroup);
        //imagePlane.add(addNormalArrow(imagePlane));
        clipPlaneAxis = new THREE.Vector3().copy(initClipDir);
        console.log(clipPlaneAxis);
    });
    await loadSatellite(satelliteFile);
    await loadStars(starTexture);

    const groundGeo = new THREE.SphereGeometry(groundSize, 128, 128);
    const sunDir = new THREE.Vector3(1, 1, 0).normalize();
    const groundMat = new THREE.ShaderMaterial({
        vertexShader: oceanVertexShader,
        fragmentShader: oceanFragmentShader,
        uniforms: {
            uSunDirection: new THREE.Uniform(sunDir),
            uAtmColor: new THREE.Uniform(new THREE.Color(0xffffff)),
            uAmbientColor: new THREE.Uniform(new THREE.Color(0x0d2d63)),
            uSpecularColor: new THREE.Uniform(new THREE.Color(0x111111)),
            uShininess: new THREE.Uniform(30.0)
        }
    });
    ground = new THREE.Mesh(groundGeo, groundMat);
    scene.add(ground);
    ground.position.copy(groundPosition);

    /*
    const atmGeo = new THREE.SphereGeometry(groundSize * 1.001, 128, 128);
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
    atm = new THREE.Mesh(atmGeo, atmMat);
    scene.add(atm);
    atm.position.copy(groundPosition);
    */

    orbitTrack = createCircle(groundSize + initSatParms.height, 1024, 0xffffff);
    scene.add(orbitTrack);
    orbitTrack.position.copy(groundPosition);

    window.addEventListener('resize', onWindowResize, false);
}

async function loadGLTF(modelName) {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(
            modelName,
            function (gltf) {
                cloudGroup = new THREE.Group();
                clipPlane = new THREE.Plane(initClipDir, initClipPos);
                const cloudModel = gltf.scene;

                // First traversal to replace materials for Points nodes
                cloudModel.traverse((node) => {
                    if (node instanceof THREE.Points) {
                        node.material = createPointCloudMaterial();
                    }
                });

                // Offset vector to shift the origin by -0.5 in X and Z axes
                const offset = new THREE.Vector3(-0.5 * modelDim, 0, 0.5 * modelDim);

                // Traverse the model and adjust geometries
                cloudModel.traverse((node) => {
                    if (node instanceof THREE.Mesh || node instanceof THREE.Points) {
                        // Translate the geometry to shift the origin
                        node.geometry.translate(offset.x, offset.y, offset.z);
                    }
                });

                // Apply scaling to the model
                cloudModel.scale.set(1 / modelDim, 1 / modelDim, 1 / modelDim);

                // Add the original model to the scene
                cloudGroup.add(cloudModel);

                // Create the clone and share geometries and materials
                const cloudModelClone = cloneModelSharingGeometryAndMaterials(cloudModel);

                // Offset the clone by -1 * modelDim in X direction (after scaling, this is -1)
                cloudModelClone.position.x = -1;

                // Add the clone to the scene
                cloudGroup.add(cloudModelClone);
                scene.add(cloudGroup);

                resolve();
            },
            undefined,
            function (error) {
                console.error(`Failed to load point cloud model: ${error}`);
                reject(error);
            }
        );
    });
}

// Helper function to clone the model and share geometries and materials
function cloneModelSharingGeometryAndMaterials(original) {
    const clone = original.clone();

    function traverseAndShare(originalNode, clonedNode) {
        if (originalNode.isMesh || originalNode.isPoints) {
            clonedNode.geometry = originalNode.geometry; // Share geometry
            clonedNode.material = originalNode.material; // Share material
        }

        // Recursively traverse children
        for (let i = 0; i < originalNode.children.length; i++) {
            traverseAndShare(originalNode.children[i], clonedNode.children[i]);
        }
    }

    traverseAndShare(original, clone);

    return clone;
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

async function loadPlane(planeTex) {
    return new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(planeTex, function (texture) {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 8;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.x = 1;
            texture.repeat.y = 1;
            texture.needsUpdate = true;
            const planeGeo = new THREE.PlaneGeometry(1, 1);
            const planeMat = new THREE.ShaderMaterial({
                uniforms: {
                    uMap: { value: texture },
                    // use the lower value of the colormap radiance image as a chroma key
                    uKeyColor: { value: new THREE.Vector3(2 / 255, 10 / 255, 43 / 255) },
                    uThreshold: { value: 0.1 }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D uMap;
                    uniform vec3 uKeyColor;
                    uniform float uThreshold;
                    varying vec2 vUv;

                    void main() {
                        vec4 color = texture2D(uMap, vUv);
                        
                        // Compute the distance from the key color
                        float diff = distance(color.rgb, uKeyColor);

                        // Make the color transparent if close to the key color
                        if (diff < uThreshold) {
                            discard;
                        }

                        gl_FragColor = color;
                        #include <tonemapping_fragment>
                        #include <colorspace_fragment>
                    }
                `,
                transparent: true,
                side: THREE.DoubleSide
            });
            imagePlane = new THREE.Mesh(planeGeo, planeMat);
            imagePlane.rotation.set(-Math.PI / 2.0, 0.0, 0.0);
            imagePlane.scale.y *= -1;
            scene.add(imagePlane);
            resolve();
        }, undefined, function (error) {
            console.error(`Failed to image plane texture: ${error}`);
            reject(error);
        });
    });
}

function addNormalArrow(imagePlane) {
    // Define the arrow properties
    const arrowLength = 0.5; // Adjust length as needed
    const arrowColor = 0xff0000; // Red color for visibility

    // Calculate the normal direction of imagePlane
    const normalDirection = new THREE.Vector3(0, -1, 0).applyQuaternion(imagePlane.quaternion).normalize();

    // Create the ArrowHelper
    const arrowHelper = new THREE.ArrowHelper(normalDirection, imagePlane.position, arrowLength, arrowColor);

    // Add the ArrowHelper to the scene
    scene.add(arrowHelper);

    return arrowHelper;
}

async function loadSatellite(modelName) {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(modelName, function (glb) {
            satModel = glb.scene;
            satModel.position.y = initSatParms.height;

            const frustumHeight = initSatParms.height / initSatParms.scale;
            const frustumRadius = 1.0 / initSatParms.scale;

            const satSpacing = initSatParms.spacing / initSatParms.scale;

            const createFrustum = (frustumRadius, frustumHeight, offset) => {
                const frustumGeo = new THREE.BufferGeometry();
                const vertices = new Float32Array([
                    0, -1, 0,
                    -frustumRadius / 2, -frustumHeight, -offset,
                    frustumRadius / 2, -frustumHeight, -offset,
                ]);
                frustumGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                frustumGeo.setIndex([0, 1, 2]);
                frustumGeo.computeVertexNormals();

                const frustumMaterial = new THREE.MeshBasicMaterial({
                    color: 0x00ff00,
                    transparent: true,
                    opacity: 0.25,
                    side: THREE.DoubleSide,
                });

                const frustumMesh = new THREE.Mesh(frustumGeo, frustumMaterial);
                frustumMesh.rotation.set(0, Math.PI / 2, 0);
                frustumMesh.name = 'frustum'; // Assign a name for easy identification
                return frustumMesh;
            };


            const originalFrustum = createFrustum(frustumRadius, frustumHeight, 0);
            satModel.add(originalFrustum);

            const satModelClone1 = satModel.clone();
            const satModelClone2 = satModel.clone();

            satModelClone1.remove(satModelClone1.getObjectByName('frustum'));
            satModelClone2.remove(satModelClone2.getObjectByName('frustum'));
            const frustumClone1 = createFrustum(frustumRadius, frustumHeight, satSpacing);
            satModelClone1.add(frustumClone1);
            const frustumClone2 = createFrustum(frustumRadius, frustumHeight, -satSpacing);
            satModelClone2.add(frustumClone2);

            // slop factors are added to account for the fact that I am not moving
            // along the track exactly. TO DO: fix this when adding animations.
            satModelClone1.children[0].position.set(satSpacing, 0.2, 0.2);
            satModelClone1.children[0].rotation.set(0, Math.PI, -Math.PI / 4);
            satModelClone2.children[0].position.set(-satSpacing, -0.6, -0.2);
            satModelClone2.children[0].rotation.set(0, 0, Math.PI / 4);
            satModelClone1.children[1].position.set(satSpacing, -0.4, 0);
            satModelClone2.children[1].position.set(-satSpacing, -0.4, 0);

            // Add the clones as children of the original satellite model
            satModel.add(satModelClone1);
            satModel.add(satModelClone2);

            // Add the original satellite model (with its clones) to the scene
            satModel.scale.set(initSatParms.scale, initSatParms.scale, initSatParms.scale);
            scene.add(satModel);
            resolve();
        }, undefined, function (error) {
            console.error(`Failed to load satellite model: ${error}`);
            reject(error);
        });
    });
}

async function loadStars(starTex) {
    return new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(starTex, function (texture) {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            const skyGeo = new THREE.SphereGeometry(1, 32, 32);
            const skyMat = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.BackSide,
                depthWrite: false
            });
            sky = new THREE.Mesh(skyGeo, skyMat);
            sky.scale.setScalar(20);
            // arbitrary rotations to put a well-populated part of the sky in the background
            sky.rotation.y = 3 * Math.PI / 4;
            sky.rotation.z = - Math.PI / 4;
            scene.add(sky);
            resolve();
        }, undefined, function (error) {
            console.error(`Failed to load sky texture: ${error}`);
            reject(error);
        });
    });
}

function createCircle(radius, segments, color) {
    // Create an array to hold the circle's vertices
    const positions = [];

    // Generate the circle's points
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = radius * Math.cos(theta);
        const y = radius * Math.sin(theta);
        const z = 0; // Circle lies in the XY plane
        positions.push(x, y, z);
    }

    // Create a BufferGeometry and set its position attribute
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    // Create a material for the line
    const material = new THREE.LineBasicMaterial({ color });

    // Create the LineLoop (connects the points in a loop)
    const circle = new THREE.LineLoop(geometry, material);

    // Rotate the circle to wrap around the sphere appropriately
    circle.rotation.x = Math.PI / 2; // Adjust as needed

    return circle;
}

function getPosition(lat, lon) {
    const latRad = THREE.MathUtils.degToRad(lat);
    const lonRad = THREE.MathUtils.degToRad(lon);
    const planePosition = new THREE.Vector3(
        groundPosition.x + groundSize * Math.cos(latRad) * Math.cos(lonRad),
        groundPosition.y + groundSize * Math.sin(latRad),
        groundPosition.z + groundSize * Math.cos(latRad) * Math.sin(lonRad));

    return {
        position: planePosition,
        normal: new THREE.Vector3()
            .subVectors(planePosition, groundPosition)
            .normalize()
    }
}

function positionScene(lat, lon, satHeight, rotAngle) {
    const { position, normal } = getPosition(lat, lon);
    const planePosition = position;

    // This accounts for the -pi / 2 rotation on the x axis that the plane requires, 
    // otherwise the radiance image plane will appear perpendicular to ground/ocean
    const planeNormal = new THREE.Vector3(0, 0, 1);
    const modelNormal = new THREE.Vector3(0, 0, 1);


    imagePlane.position.copy(planePosition);
    imagePlane.quaternion.setFromUnitVectors(planeNormal, normal);

    const normalDir = new THREE.Vector3(0, -1, 0).applyQuaternion(imagePlane.quaternion).normalize();


    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(normalDir, THREE.MathUtils.degToRad(rotAngle));

    cloudGroup.position.copy(planePosition);
    cloudGroup.quaternion.setFromUnitVectors(modelNormal, normalDir);
    cloudGroup.quaternion.multiply(rotationQuaternion);

    const satDisp = normal.clone().multiplyScalar(satHeight);
    satModel.position.copy(planePosition).add(satDisp);
    satModel.quaternion.setFromUnitVectors(modelNormal, normalDir);
    satModel.quaternion.multiply(rotationQuaternion);

    if (imagePlane.arrowHelper) {
        // Update arrow's position and direction
        imagePlane.arrowHelper.position.copy(imagePlane.position);
        imagePlane.arrowHelper.setDirection(normal.clone().applyQuaternion(rotationQuaternion));
    }

    sky.position.copy(planePosition);

    const trackQuat = new THREE.Quaternion().setFromUnitVectors(modelNormal, normalDir);
    orbitTrack.quaternion.copy(trackQuat);

    controls.target.copy(imagePlane.position);
    controls.update();
}

function initGUI() {
    const gui = new GUI();

    /* Scene Positioning */
    const folderScene = gui.addFolder('Scene Positioning');
    const propsScene = {
        cameraDist: initOffset,
        cameraRotX: -38,
        cameraRotY: -66,
        modelLat: 81,
        modelLon: -120,
        modelRot: 4.0,
        satHeight: initSatParms.height
    };
    function getCameraRotation() {
        const crX = THREE.MathUtils.degToRad(propsScene.cameraRotX);
        const crY = THREE.MathUtils.degToRad(propsScene.cameraRotY);
        return new THREE.Euler(crX, crY, 0, 'XYZ');
    }
    folderScene.add(propsScene, 'cameraDist', 0.1, 10, 0.05).onChange(() => {
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });
    folderScene.add(propsScene, 'cameraRotX', -180, 180, 1).onChange(() => {
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });
    folderScene.add(propsScene, 'cameraRotY', -180, 180, 1).onChange(() => {
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });
    folderScene.add(propsScene, 'modelLat', -90, 90, 1).onChange(() => {
        positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });
    folderScene.add(propsScene, 'modelLon', -180, 180, 1).onChange(() => {
        positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });
    folderScene.add(propsScene, 'modelRot', -45, 45, 0.1).onChange(() => {
        positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
        controls.update();
    });
    folderScene.add(propsScene, 'satHeight', 0, 1, 0.01).onChange(() => {
        positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight);
        controls.update();
    });

    const folderClip = gui.addFolder('Clip Plane');
    const propsClip = {
        get 'enabled'() {
            return renderer.localClippingEnabled;
        },
        set 'enabled'(v) {
            renderer.localClippingEnabled = v;
        },
        get 'axis'() {
            if (clipPlaneAxis.x === -1) {
                return 'X';
            }
            else if (clipPlaneAxis.y === -1) {
                return 'Y';
            }
            else if (clipPlaneAxis.z === -1) {
                return 'Z';
            }
        },
        set 'axis'(v) {
            switch (v) {
                case 'X':
                    clipPlaneAxis.set(-1, 0, 0);
                    break;
                case 'Y':
                    clipPlaneAxis.set(0, -1, 0);
                    break;
                case 'Z':
                    clipPlaneAxis.set(0, 0, -1);
                    break;
            }
            const normalDir = new THREE.Vector3().copy(clipPlaneAxis).applyQuaternion(cloudGroup.quaternion).normalize();
            clipPlane.normal.copy(normalDir);
        },
        get 'planePosition'() {
            let imagePos;
            switch (propsClip.axis) {
                case 'X':
                    imagePos = cloudGroup.position.x;
                    break;
                case 'Y':
                    imagePos = cloudGroup.position.y;
                    break;
                case 'Z':
                    imagePos = cloudGroup.position.z;
                    break;
            }
            return clipPlane.constant - imagePos;
        },
        set 'planePosition'(v) {
            let imagePos;
            switch (propsClip.axis) {
                case 'X':
                    imagePos = cloudGroup.position.x;
                    break;
                case 'Y':
                    imagePos = cloudGroup.position.y;
                    break;
                case 'Z':
                    imagePos = cloudGroup.position.z;
                    break;
            }
            clipPlane.constant = imagePos + v;
        },
    };
    folderClip.add(propsClip, 'enabled');
    folderClip.add(propsClip, 'axis', ['X', 'Y', 'Z']);
    folderClip.add(propsClip, 'planePosition', -10.0, 10.0, 0.01);

    const folderCloud = gui.addFolder('Cloud Parameters');
    if (useGltf) {
        const propsCloud = {
            scale: defaultPointSize,
            posY: 0.0
        };

        function cloudsChanged() {
            for (let model of cloudGroup.children) {
                model.traverse((node) => {
                    if (node instanceof THREE.Points) {
                        const uniforms = node.material.uniforms;
                        uniforms['uScale'].value = propsCloud.scale;
                    }
                });
            }
            const { position, normal } = getPosition(propsScene.modelLat, propsScene.modelLon);
            const cloudDisp = normal.clone().multiplyScalar(propsCloud.posY);
            cloudGroup.position.copy(position).add(cloudDisp);

        }
        folderCloud.add(propsCloud, 'scale', 0.1, 10, 0.1).onChange(cloudsChanged);
        folderCloud.add(propsCloud, 'posY', -0.2, 0.2, 0.01).onChange(cloudsChanged);
        cloudsChanged();
    }

    const folderLight = gui.addFolder('Light Position');
    const propsLight = {
        posX: 200.0,
        posY: 200.0,
        posZ: -185.0,
        fillX: -30.0,
        fillY: 0.0,
        fillZ: -35.0
    };
    function moveLight(posX, posY, posZ) {
        keyLight.position.set(
            satModel.position.x + posX,
            satModel.position.y + posY,
            satModel.position.z + posZ);
        keyLight.target = satModel;
        fillLight.position.set(
            satModel.position.x + propsLight.fillX,
            satModel.position.y + propsLight.fillY,
            satModel.position.z + propsLight.fillZ);
        fillLight.target = satModel;
    }
    folderLight.add(propsLight, 'posX', 0, 200, 1).onChange(() => {
        moveLight(propsLight.posX, propsLight.posY, propsLight.posZ);
    });
    folderLight.add(propsLight, 'posY', 200, 300, 1).onChange(() => {
        moveLight(propsLight.posX, propsLight.posY, propsLight.posZ);
    });
    folderLight.add(propsLight, 'posZ', -300, 0, 1).onChange(() => {
        moveLight(propsLight.posX, propsLight.posY, propsLight.posZ);
    });
    folderLight.add(propsLight, 'fillX', -200, 200, 1).onChange(() => {
        moveLight(propsLight.posX, propsLight.posY, propsLight.posZ);
    });
    folderLight.add(propsLight, 'fillY', -10, 10, 1).onChange(() => {
        moveLight(propsLight.posX, propsLight.posY, propsLight.posZ);
    });
    folderLight.add(propsLight, 'fillZ', -50, 50, 1).onChange(() => {
        moveLight(propsLight.posX, propsLight.posY, propsLight.posZ);
    });

    gui.add(renderParms, 'fps', 10, 60, 1).onChange(() => {
        renderParms.interval = 1000 / renderParms.fps;
    });

    positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
    moveLight(propsLight.posX, propsLight.posY, propsLight.posZ);
    console.log(satModel.quaternion);
    const normalDir = new THREE.Vector3().copy(clipPlaneAxis).applyQuaternion(cloudGroup.quaternion).normalize();
    clipPlane.normal.copy(normalDir);
    clipPlane.constant = cloudGroup.position.x + initClipPos;
    fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
    controls.update();
}

function fitCameraToObject(camera, object, offset, rotation) {
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

    const cameraOffset = new THREE.Vector3(0, 0, cameraZ);
    cameraOffset.applyEuler(rotation);

    // zoom out a little so that objects don't fill the screen
    camera.position.copy(object.position).add(cameraOffset);
    camera.lookAt(object.position);

    camera.updateProjectionMatrix();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(time) {
    controls.update();

    const delta = time - renderParms.lastTime;

    // Only render if enough time has passed
    if (delta > renderParms.interval) {
        renderParms.lastTime = time;
        renderer.render(scene, camera); // Render the scene
    }

    requestAnimationFrame(animate);
}
