import * as THREE from 'three';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// import atmVertexShader from './shaders/atm/atmVertex.glsl';
// import atmFragmentShader from './shaders/atm/atmFragment.glsl';
import oceanVertexShader from './shaders/ocean/oceanVertex.glsl';
import oceanFragmentShader from './shaders/ocean/oceanFragment.glsl';

let container, camera, controls, scene, renderer;
let cloudGroup, imagePlane, ground, satelliteGroup; //, atm;
let clipPlane, clipPlaneAxis;
let sky, keyLight, fillLight, orbitTrack;

const useGltf = true;
const useBigModel = true;
const useNormalHelper = false;

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

const initClipDir = new THREE.Vector3(-1, 0, 0);
const groundSize = 100; // for spherical ground
const groundPosition = new THREE.Vector3(0, -100, 0);

const sceneParms = {
    offset: 1.25,
    isoX: -34,
    isoY: -70,
    isoLat: 81,
    isoLon: -120,
    isoRot: 0,
    isoClipPos: 0,
    sideLat: 81,
    sideLon: -90,
    sideRot: 0,
    sideClipPos: 0
};

const renderParms = {
    fps: 10,
    interval: 100,
    lastTime: 0
};

const satParms = {
    scale: 0.02,
    height: 0.4,
    spacing: 0.005
};

const cloudParms = {
    pointSize: 0.1,
    yOffset: 0.0,
    color: new THREE.Color(0xffffff),
    opacity: 1.0
};

const orbitRadius = groundSize + satParms.height;

await init().then(() => {
    for (const child of scene.children) {
        console.log(child);
        if (child.name === 'radiance') {
            child.renderOrder = -1;
        } else if (child.name === 'satellites') {
            child.renderOrder = 0;
        }
        console.log(`Render order: ${child.renderOrder}`);
    }
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

        if (useNormalHelper) {
            addNormalArrow(imagePlane);
        }

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

            console.log(`Radiance image at x = ${x}, threshold = ${imPlaneClone.material.uniforms.uThreshold.value}`);

            imPlaneClone.position.x = x;
            imPlaneClone.rotation.x = Math.PI;

            planeGroup.add(imPlaneClone);
        }

        imagePlane.add(planeGroup);
        clipPlaneAxis = new THREE.Vector3().copy(initClipDir);
        console.log(clipPlaneAxis);
    });
    // load 3 satellites initially
    await loadSatellite(satelliteFile, 3);
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

    window.addEventListener('resize', onWindowResize, false);
}

async function loadGLTF(modelName) {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(
            modelName,
            function (gltf) {
                cloudGroup = new THREE.Group();
                // scene opens in iso view, so use the value for the iso view
                clipPlane = new THREE.Plane(initClipDir, sceneParms.isoClipPos);
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


        uniform vec3 uCloudColor;
        uniform float uCloudOpacity;

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

            vec4 diffuseColor = vec4(uCloudColor, uCloudOpacity);
            color = diffuseColor;
        }
    `;

    // Even though opacity is adjustable, I am not setting transparency to true
    // until we know that adjusting opacity is a desirable effect for communicating the message
    const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            'uScale': { value: cloudParms.pointSize },
            'uCloudColor': { value: cloudParms.color },
            'uCloudOpacity': { value: cloudParms.opacity }
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
            // Mirror flip the image to match the orientation of the point cloud
            imagePlane.scale.y *= -1;
            imagePlane.name = 'radiance';
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
    const normalDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(imagePlane.quaternion).normalize();

    // Create the ArrowHelper
    const arrowHelper = new THREE.ArrowHelper(normalDirection, imagePlane.position, arrowLength, arrowColor);

    // Add the ArrowHelper to the scene
    imagePlane.add(arrowHelper);

    return arrowHelper;
}

async function loadSatellite(modelName, numSatellites) {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(modelName, function (glb) {
            satelliteGroup = new THREE.Group();

            // Original satellite model
            const satModel = glb.scene;
            //satModel.position.y = satParms.height;

            const frustumHeight = satParms.height / satParms.scale;
            const frustumRadius = 1.0 / satParms.scale;
            satModel.scale.set(satParms.scale, satParms.scale, satParms.scale);

            // Function to create a frustum
            const createFrustum = (frustumRadius, frustumHeight, frustumLength) => {
                const frustumGeo = new THREE.BufferGeometry();
                const vertices = new Float32Array([
                    0, -1, 0,
                    -frustumRadius / 2, -frustumHeight, -frustumLength,
                    frustumRadius / 2, -frustumHeight, -frustumLength,
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

            orbitTrack = createCircle(orbitRadius, 1024, 0xffffff);
            scene.add(orbitTrack);
            orbitTrack.position.copy(groundPosition);
            const modelUp = new THREE.Vector3(0, 1, 0);
            const modelNormal = new THREE.Vector3()
                .subVectors(imagePlane.position, groundPosition)
                .normalize();
            const modelQuat = new THREE.Quaternion().setFromUnitVectors(modelUp, modelNormal);
            orbitTrack.quaternion.copy(modelQuat);

            // Calculate the angular positions of the satellites
            for (let i = 0; i < numSatellites; i++) {
                let satellite, frustum;
                const theta = (i - (numSatellites - 1) / 2) * satParms.spacing;

                if (theta === 0) {
                    satellite = satModel;
                    frustum = createFrustum(frustumRadius, frustumHeight, 0);
                    satellite.add(frustum);
                    //frustum.position.set(0, -1, 0);
                    //frustum.rotation.set(0, Math.PI / 2, 0);
                } else {
                    satellite = satModel.clone();
                    satellite.remove(satellite.getObjectByName('frustum'));

                    const x = orbitRadius * Math.sin(theta);
                    const y = orbitRadius * Math.cos(theta);
                    const position = new THREE.Vector3(x, y, 0);
                    position.applyQuaternion(orbitTrack.quaternion);
                    position.add(orbitTrack.position);
                    position.y -= satParms.height;
                    satellite.position.copy(position);

                    // Calculate the vector from the ground position to the satellite
                    const direction = new THREE.Vector3()
                        .subVectors(position, groundPosition)
                        .normalize();

                    // Set the satellite's quaternion to face away from the ground position
                    const up = new THREE.Vector3(0, 1, 0); // Assuming the satellite's up vector is Y
                    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
                    satellite.quaternion.copy(quaternion);

                    const frustumLength = (groundSize) * Math.tan(theta) / satParms.scale;
                    console.log(frustumLength);
                    frustum = createFrustum(frustumRadius, frustumHeight, frustumLength);
                    satellite.add(frustum);
                }

                satelliteGroup.add(satellite);
            }

            satelliteGroup.name = 'satellites';

            scene.add(satelliteGroup);

            resolve();
        },
            undefined,
            function (error) {
                console.error(`Failed to load satellite model: ${error}`);
                reject(error);
            }
        );
    });
}

function adjustSatelliteAndFrustum(satellite, frustum, theta) {
    if (theta === 0) {
        // Center satellite (x === 0)
        frustum.position.set(0, -1, 0);
        frustum.rotation.set(0, Math.PI / 2, 0);
    } else {
        const x = orbitRadius * Math.sin(theta);
        const y = orbitRadius * Math.cos(theta);
        const position = new THREE.Vector3(x, y, 0);
        position.applyQuaternion(orbitTrack.quaternion);
        position.add(orbitTrack.position);
        satellite.position.copy(position);

        // Calculate the vector from the ground position to the satellite
        const direction = new THREE.Vector3()
            .subVectors(position, groundPosition)
            .normalize();

        // Set the satellite's quaternion to face away from the ground position
        const up = new THREE.Vector3(0, 1, 0); // Assuming the satellite's up vector is Y
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
        satellite.quaternion.copy(quaternion);
    }
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
    const positions = [];

    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = radius * Math.cos(theta);
        const y = radius * Math.sin(theta);
        const z = 0; // Circle lies in the XY plane
        positions.push(x, y, z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({ color });

    // LineLoop connects the points in positions in a loop
    const circle = new THREE.LineLoop(geometry, material);

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
    // Determine the position and normal on the sphere for the given latitude and longitude
    const { position, normal } = getPosition(lat, lon);
    const planePosition = position;

    // This accounts for the -pi / 2 rotation on the x axis that the plane requires, 
    // otherwise the radiance image plane will appear perpendicular to ground/ocean
    const modelUp = new THREE.Vector3(0, 1, 0);
    const modelQuat = new THREE.Quaternion().setFromUnitVectors(modelUp, normal);
    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(normal, THREE.MathUtils.degToRad(rotAngle));
    modelQuat.multiply(rotationQuaternion);

    imagePlane.position.copy(planePosition);
    imagePlane.quaternion.setFromUnitVectors(modelUp, normal);
    imagePlane.rotateOnAxis(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

    const cloudDisp = normal.clone().multiplyScalar(cloudParms.yOffset);
    cloudGroup.position.copy(planePosition).add(cloudDisp);
    cloudGroup.quaternion.copy(modelQuat);

    const clipNormal = new THREE.Vector3(-1, 0, 0).applyQuaternion(cloudGroup.quaternion).normalize();
    clipPlane.normal.copy(clipNormal);
    clipPlane.constant = cloudGroup.position.x;

    const satDisp = normal.clone().multiplyScalar(satHeight);
    satelliteGroup.position.copy(planePosition).add(satDisp);
    satelliteGroup.quaternion.copy(modelQuat);

    if (imagePlane.arrowHelper) {
        // Update arrow's position and direction
        imagePlane.arrowHelper.position.copy(imagePlane.position);
        imagePlane.arrowHelper.setDirection(normal.clone().applyQuaternion(rotationQuaternion));
    }

    sky.position.copy(planePosition);

    orbitTrack.quaternion.copy(modelQuat);

    controls.target.copy(imagePlane.position);
    controls.update();
}

function initGUI() {
    const gui = new GUI();

    /* Scene Positioning */
    const folderScene = gui.addFolder('Scene Positioning');
    // initial gui props should be set to the iso view
    const propsScene = {
        cameraDist: sceneParms.offset,
        cameraRotX: sceneParms.isoX,
        cameraRotY: sceneParms.isoY,
        modelLat: sceneParms.isoLat,
        modelLon: sceneParms.isoLon,
        modelRot: sceneParms.isoRot,
        satHeight: satParms.height
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
        function cloudsChanged() {
            for (let model of cloudGroup.children) {
                model.traverse((node) => {
                    if (node instanceof THREE.Points) {
                        const uniforms = node.material.uniforms;
                        uniforms['uScale'].value = cloudParms.pointSize;
                        uniforms['uCloudColor'].value = cloudParms.color;
                        uniforms['uCloudOpacity'].value = cloudParms.opacity;
                    }
                });
            }
            const { position, normal } = getPosition(propsScene.modelLat, propsScene.modelLon);
            const cloudDisp = normal.clone().multiplyScalar(cloudParms.yOffset);
            cloudGroup.position.copy(position).add(cloudDisp);
        }
        folderCloud.add(cloudParms, 'pointSize', 0.1, 10, 0.1).onChange(cloudsChanged);
        folderCloud.add(cloudParms, 'yOffset', -0.2, 0.2, 0.01).onChange(cloudsChanged);
        folderCloud.addColor(cloudParms, 'color').onChange(cloudsChanged);
        folderCloud.add(cloudParms, 'opacity', 0.0, 1.0, 0.01).onChange(cloudsChanged);
        cloudsChanged();
    }

    const folderLight = gui.addFolder('Light Position');
    const propsLight = {
        posX: 200.0,
        posY: 200.0,
        posZ: -130.0,
        fillX: -30.0,
        fillY: 0.0,
        fillZ: -35.0
    };
    function moveLight(posX, posY, posZ) {
        keyLight.position.set(
            satelliteGroup.position.x + posX,
            satelliteGroup.position.y + posY,
            satelliteGroup.position.z + posZ);
        keyLight.target = satelliteGroup;
        fillLight.position.set(
            satelliteGroup.position.x + propsLight.fillX,
            satelliteGroup.position.y + propsLight.fillY,
            satelliteGroup.position.z + propsLight.fillZ);
        fillLight.target = satelliteGroup;
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
    gui.add({ capture: captureCanvasImage }, 'capture').name('Capture Canvas');
    gui.add({ captureSquare: captureSquareImage }, 'captureSquare').name('Capture Square Image');

    positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
    moveLight(propsLight.posX, propsLight.posY, propsLight.posZ);
    console.log(satelliteGroup.quaternion);
    const normalDir = new THREE.Vector3().copy(clipPlaneAxis).applyQuaternion(cloudGroup.quaternion).normalize();
    clipPlane.normal.copy(normalDir);
    clipPlane.constant = cloudGroup.position.x + sceneParms.isoClipPos;
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
    const objectNormal = new THREE.Vector3()
        .subVectors(object.position, groundPosition)
        .normalize();
    const modelQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), objectNormal);
    cameraOffset.applyQuaternion(modelQuat);
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

/*
function captureCanvasImage() {
    renderer.render(scene, camera);

    const dataURL = renderer.domElement.toDataURL('image/png');

    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'cloud_tomo_render.png';
    link.click(); // Trigger download
}
*/

function captureCanvasImage() {
    // Store the current renderer size to go back to it after rendering at target res
    const originalWidth = renderer.domElement.width;
    const originalHeight = renderer.domElement.height;

    // render at 4K
    const targetWidth = 3840;
    const targetHeight = 2160;
    renderer.setSize(targetWidth, targetHeight, false);
    renderer.setPixelRatio(1);

    renderer.render(scene, camera);

    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'tomography_isoview_3840x2160.png';
    link.click(); // Trigger download

    renderer.setSize(originalWidth, originalHeight, false);
    renderer.setPixelRatio(window.devicePixelRatio);

    renderer.render(scene, camera);
}

function captureSquareImage() {
    // Store the current renderer size to go back to it after rendering at target res
    const originalWidth = renderer.domElement.width;
    const originalHeight = renderer.domElement.height;

    // render at 4K
    const targetWidth = 2000;
    const targetHeight = 2000;
    renderer.setSize(targetWidth, targetHeight, false);
    renderer.setPixelRatio(1);

    renderer.render(scene, camera);

    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'tomography_isoview_2000x2000.png';
    link.click(); // Trigger download

    renderer.setSize(originalWidth, originalHeight, false);
    renderer.setPixelRatio(window.devicePixelRatio);

    renderer.render(scene, camera);
}
