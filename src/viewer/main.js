import * as THREE from 'three';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// import atmVertexShader from './shaders/atm/atmVertex.glsl';
// import atmFragmentShader from './shaders/atm/atmFragment.glsl';
import oceanVertexShader from './shaders/ocean/oceanVertex.glsl';
import oceanFragmentShader from './shaders/ocean/oceanFragment.glsl';

let container, camera, controls, scene, renderer;
let cloudGroup, imagePlane, ground, satelliteGroup, satModel; //, atm;
let clipPlane, clipPlaneAxis;
let sky, keyLight, fillLight, orbitTrack;

const useGltf = true;
const useBigModel = true;
const useNormalHelper = false;
const useMultiFrusta = false;
const useSimple = true;

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
    sideX: -14,
    sideY: -6,
    sideLat: 81,
    sideLon: -90,
    sideRot: 0,
    sideClipPos: 0.5,
    initSats: 3,
    viewType: 'iso'
};

const renderParms = {
    fps: 30,
    interval: 1000 / 30,
    lastTime: 0
};

const satParms = {
    scale: 0.02,
    height: 0.4,
    spacing: 0.005,
    colT0: 0x00ff00,
    colTm1: 0x0000ff,
    colTp1: 0x0000ff,
    //colT0: 0xf0e442,
    //colTm1: 0x56b4e9,
    //colTp1: 0xcc79a7,
    colDft: 0x00ff00,
    numSatellites: sceneParms.initSats,
    minSatellites: 1,
    maxSatellites: 11
};

const cloudParms = {
    pointSize: 0.1,
    yOffset: 0.0,
    color: new THREE.Color(0xffffff),
    opacity: 1.0
};

await init().then(() => {
    for (const child of scene.children) {
        console.log(child);
        if (child.name === 'radiance') {
            child.renderOrder = -1;
        } else if (child.name === 'satellites') {
            setSatelliteRenderOrder(satParms.numSatellites);
        }
        console.log(`Render order: ${child.renderOrder}`);
    }
    if (useSimple) {
        initGUISimple();
    } else {
        initGUI();
    }
    requestAnimationFrame(animate);
});

async function init() {
    container = document.createElement('div');
    document.body.appendChild(container);

    const aspect = window.innerWidth / window.innerHeight;
    if (useMultiFrusta) {
        camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
    } else {
        camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    }

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

    window.addEventListener('resize', onWindowResize, false);
}

async function loadGLTF(modelName) {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(
            modelName,
            function (gltf) {
                cloudGroup = new THREE.Group();
                // use side view default for multi frusta scene, otherwise use 0
                clipPlane = new THREE.Plane(initClipDir, sceneParms.isoClipPos);
                if (useMultiFrusta) {
                    clipPlane.constant = cloudGroup.position.x + sceneParms.sideClipPos;
                } else {
                    clipPlane.constant = cloudGroup.position.x + sceneParms.isoClipPos;
                }
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
            clonedNode.material = createPointCloudMaterial(); // Don't share material
            clonedNode.material.uniforms['uCloudColor'] = new THREE.Color(0xffffff);
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
        
        out vec3 vPosition;

        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            // increasing the numerator increases the size of the points
            gl_PointSize = uScale / -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;

            vPosition = position;
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

        in vec3 vPosition;

        out vec4 color;

        vec3 ACESFilmToneMapping(vec3 color) {
            const float a = 2.51;
            const float b = 0.03;
            const float c = 2.43;
            const float d = 0.59;
            const float e = 0.14;
            return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
        }

        vec3 LinearToSRGB(vec3 color) {
            vec3 cutoff = step(vec3(0.0031308), color);
            vec3 lower = color * 12.92;
            vec3 higher = (pow(clamp(color, 0.0031308, 1.0), vec3(1.0 / 2.4)) * 1.055) - 0.055;
            return mix(lower, higher, cutoff);
        }

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

            /*
            float t = (vPosition.x + 1024.0) / 2048.0;
            t = clamp(t, 0.0, 1.0);
            vec3 gradientColor;
            vec3 uColortm1 = vec3(1.0);
            vec3 uColort0 = vec3(0.0, 1.0, 1.0);
            if (t <= 0.5) {
                float t1 = smoothstep(0.0, 0.05, t / 0.5);
                gradientColor = mix(uColortm1, uColort0, t1);
            } else {
                float t3 = smoothstep(0.0, 0.05, (t - 0.5) / 0.5);
                gradientColor = mix(uColort0, uCloudColor, t3);
            }
            */
            vec3 gradientColor = uCloudColor;
            gradientColor = ACESFilmToneMapping(gradientColor);
            gradientColor = LinearToSRGB(gradientColor);

            color = vec4(gradientColor, uCloudOpacity);
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

async function loadSatellite(modelName) {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(
            modelName,
            function (glb) {
                if (!satelliteGroup) {
                    satelliteGroup = new THREE.Group();
                    satelliteGroup.name = 'satellites';
                    scene.add(satelliteGroup);
                }

                satModel = glb.scene;
                satModel.scale.set(satParms.scale, satParms.scale, satParms.scale);

                // create the clones of the original glb
                createSatellites(satParms.numSatellites);

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

function createSatellites(numSatellites) {
    const orbitRadius = groundSize + satParms.height;

    const modelUp = new THREE.Vector3(0, 1, 0);
    const modelQuat = new THREE.Quaternion().setFromUnitVectors(modelUp, modelUp);
    const satSpacing = Math.max(satParms.spacing - 0.0005 * Math.max(numSatellites - 5, 0), 0.0025);

    if (!orbitTrack) {
        orbitTrack = createCircle(orbitRadius, 1024, 0xffffff);
        scene.add(orbitTrack);
        orbitTrack.position.copy(groundPosition);
        orbitTrack.quaternion.copy(modelQuat);
    }

    const frustumHeight = satParms.height / satParms.scale;
    const frustumRadius = 1.0 / satParms.scale;

    // Loop to create satellites along the orbitTrack
    for (let i = 0; i < numSatellites; i++) {
        let satellite, frustum;
        const theta = (i - (numSatellites - 1) / 2) * satSpacing;

        const createFrustum = (frustumRadius, frustumHeight, frustumLength, col, id) => {
            const frustumGeo = new THREE.BufferGeometry();
            // Experimentally derived way to slightly adjust the frustum component down for satellites
            // that are further out. This makes the line where the frusta meet line up visually. 
            const frustumAdjustment = -0.2 * (Math.abs(frustumLength) - 25) / 25;
            const vertices = new Float32Array([
                0, -1, 0,
                -frustumRadius / 2, -frustumHeight + frustumAdjustment, -frustumLength,
                frustumRadius / 2, -frustumHeight + frustumAdjustment, -frustumLength,
            ]);
            frustumGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            frustumGeo.setIndex([0, 1, 2]);
            frustumGeo.computeVertexNormals();

            const frustumMaterial = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.25,
                side: THREE.DoubleSide,
            });

            const frustumMesh = new THREE.Mesh(frustumGeo, frustumMaterial);
            frustumMesh.rotation.set(0, Math.PI / 2, 0);
            frustumMesh.name = `frustum${id}`; // Assign a name for easy identification
            return frustumMesh;
        };

        if (theta === 0) {
            satellite = satModel.clone();
            satellite.remove(satellite.getObjectByName('frustumC'));
            if (useMultiFrusta) {
                frustum = createFrustum(frustumRadius, frustumHeight, 0, satParms.colT0, 'C');
                const frustumOff = groundSize * Math.tan(satSpacing) / satParms.scale;
                const frustumL = createFrustum(frustumRadius, frustumHeight, -frustumOff, satParms.colTp1, 'L');
                const frustumR = createFrustum(frustumRadius, frustumHeight, frustumOff, satParms.colTm1, 'R');
                satellite.add(frustum);
                satellite.add(frustumL);
                satellite.add(frustumR);
            } else {
                frustum = createFrustum(frustumRadius, frustumHeight, 0, satParms.colDft, 'C');
                satellite.add(frustum);
            }
        } else {
            satellite = satModel.clone();
            satellite.remove(satellite.getObjectByName('frustumC'));

            const x = orbitRadius * Math.sin(theta);
            const y = orbitRadius * Math.cos(theta);
            const position = new THREE.Vector3(x, y, 0);

            position.applyQuaternion(modelQuat);
            position.add(groundPosition);
            position.y -= satParms.height;

            satellite.position.copy(position);

            // Calculate the vector from the ground position to the satellite
            const direction = new THREE.Vector3()
                .subVectors(position, groundPosition)
                .normalize();

            // Set the satellite's quaternion to face away from the ground position
            const up = new THREE.Vector3(0, 1, 0);
            const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
            satellite.quaternion.copy(quaternion);

            const frustumLength = groundSize * Math.tan(theta) / satParms.scale;
            frustum = createFrustum(frustumRadius, frustumHeight, frustumLength, satParms.colT0, 'S');
            satellite.add(frustum);

            if (useMultiFrusta) {
                satellite.remove(satellite.getObjectByName('frustumL'));
                satellite.remove(satellite.getObjectByName('frustumR'));
                let col = satParms.colTp1;
                if (theta < 0) {
                    col = satParms.colTm1;
                }
                const frustumC = createFrustum(frustumRadius, frustumHeight, 0, col, 'C');
                satellite.add(frustumC);
            }
        }

        satelliteGroup.add(satellite);
    }
    setSatelliteRenderOrder(numSatellites);
}

function updateSatellites() {
    // Remove existing satellites from the group
    while (satelliteGroup.children.length > 0) {
        const satellite = satelliteGroup.children[0];
        satelliteGroup.remove(satellite);

        // Dispose of geometries and materials to free memory
        satellite.traverse((node) => {
            if (node.isMesh || node.isPoints) {
                if (node.geometry) node.geometry.dispose();
                if (node.material) node.material.dispose();
            }
        });
    }

    createSatellites(satParms.numSatellites);
}

function setSatelliteRenderOrder(numSatellites) {
    if (sceneParms.viewType == 'side') {
        const nadirIndex = Math.ceil(numSatellites / 2);
        for (let i = 1; i <= numSatellites; i++) {
            let renderOrder;
            if (i < nadirIndex) {
                renderOrder = i;
            } else if (i === nadirIndex) {
                renderOrder = numSatellites;
            } else {
                renderOrder = numSatellites - (i - nadirIndex);
            }
            satelliteGroup.children[i - 1].renderOrder = renderOrder;
        }
    } else {
        let renderOrder = numSatellites + 1;
        for (const sat of satelliteGroup.children) {
            sat.renderOrder = renderOrder;
            renderOrder -= 1;
        }
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

    setControlTarget();
}

function getDefaultCameraRot() {
    // default camera rotation and offset depend on number of satellites,
    // this function computes those values
    const cameraRot = {
        camDist: 0,
        camX: 0,
        camY: 0
    }
    const satelliteArg = Math.max((satParms.numSatellites - sceneParms.initSats), 0);


    if (sceneParms.viewType === 'iso') {
        cameraRot.camDist = Math.min(sceneParms.offset + (satelliteArg * 0.325), 2.0);
        cameraRot.camX = Math.min(sceneParms.isoX + (satelliteArg * 5), -8);
        cameraRot.camY = sceneParms.isoY;
        //cameraRot.camY = Math.min(sceneParms.isoY + (satelliteArg * 2.5), -65);
    } else {
        cameraRot.camDist = Math.min(sceneParms.offset + (satelliteArg * 0.125), 1.8);
        cameraRot.camX = sceneParms.sideX;
        cameraRot.camY = sceneParms.sideY;
        setControlTarget();
    }
    return cameraRot;
}

function setControlTarget() {
    const targetPos = new THREE.Vector3().copy(imagePlane.position);
    if (sceneParms.viewType === 'side') {
        targetPos.y += satParms.height / 2;
    }
    controls.target.copy(targetPos);
    controls.update();
}




function initGUISimple() {
    const gui = new GUI();

    // Initial GUI properties set to the iso view
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

    if (useGltf) {
        function cloudsChanged() {
            let primary = true;
            for (let model of cloudGroup.children) {
                model.traverse((node) => {
                    if (node instanceof THREE.Points) {
                        const uniforms = node.material.uniforms;
                        uniforms['uScale'].value = cloudParms.pointSize;
                        if (primary) {
                            uniforms['uCloudColor'].value = cloudParms.color;
                            primary = false;
                        } else {
                            uniforms['uCloudColor'].value = new THREE.Color(0xffffff);
                        }
                        uniforms['uCloudOpacity'].value = cloudParms.opacity;
                    }
                });
            }
            const { position, normal } = getPosition(propsScene.modelLat, propsScene.modelLon);
            const cloudDisp = normal.clone().multiplyScalar(cloudParms.yOffset);
            cloudGroup.position.copy(position).add(cloudDisp);
        }
        cloudsChanged();
    }


    /* Scene Positioning */
    const folderScene = gui.addFolder('Camera Angle');
    // Define action functions for the profiles
    const actions = {
        viewIsoProfile: function () {
            // Set propsScene values to iso profile values
            sceneParms.viewType = 'iso';
            const cameraRot = getDefaultCameraRot();
            propsScene.cameraRotX = cameraRot.camX;
            propsScene.cameraRotY = cameraRot.camY;
            propsScene.modelLat = sceneParms.isoLat;
            propsScene.modelLon = sceneParms.isoLon;
            propsScene.modelRot = sceneParms.isoRot;

            // Update the scene
            positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
            fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
            setControlTarget();
            setSatelliteRenderOrder(satParms.numSatellites);

            if (!useMultiFrusta) {
                clipPlane.constant = cloudGroup.position.x + sceneParms.isoClipPos;
            }
        },
        viewSideProfile: function () {
            // Set propsScene values to side profile values
            sceneParms.viewType = 'side';
            const cameraRot = getDefaultCameraRot();
            propsScene.cameraRotX = cameraRot.camX;
            propsScene.cameraRotY = cameraRot.camY;
            propsScene.modelLat = sceneParms.sideLat;
            propsScene.modelLon = sceneParms.sideLon;
            propsScene.modelRot = sceneParms.sideRot;

            // Update the scene
            positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
            fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
            setControlTarget();
            setSatelliteRenderOrder(satParms.numSatellites);

            if (!useMultiFrusta) {
                clipPlane.constant = cloudGroup.position.x + sceneParms.isoClipPos;
            }
        }
    };
    // Add buttons to the GUI
    folderScene.add(actions, 'viewIsoProfile').name('View Angled Profile');
    folderScene.add(actions, 'viewSideProfile').name('View Side Profile');

    const satelliteFolder = gui.addFolder('Satellites');
    satelliteFolder.add(satParms, 'numSatellites', satParms.minSatellites, satParms.maxSatellites, 2).name('Number of Satellites').onChange(() => {
        // lil-gui defaults to even numbers when using an increment of 2, but we want odd numbers
        if (satParms.numSatellites % 2 === 0) {
            satParms.numSatellites -= 1;
        }
        updateSatellites();

        const cameraRot = getDefaultCameraRot()
        propsScene.cameraDist = cameraRot.camDist;
        propsScene.cameraRotX = cameraRot.camX;
        propsScene.cameraRotY = cameraRot.camY;
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });

    gui.add({ capture: captureCanvasImage }, 'capture').name('Capture Canvas');
    gui.add({ captureSquare: captureSquareImage }, 'captureSquare').name('Capture Square Image');

    if (useMultiFrusta) {
        propsScene.cameraDist = 13.5;
        clipPlane.constant = cloudGroup.position.x + sceneParms.sideClipPos;
        actions.viewSideProfile();
    }
    positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
    moveLight(propsLight.posX, propsLight.posY, propsLight.posZ);
    const normalDir = new THREE.Vector3().copy(clipPlaneAxis).applyQuaternion(cloudGroup.quaternion).normalize();
    clipPlane.normal.copy(normalDir);
    if (useMultiFrusta) {
        clipPlane.constant = cloudGroup.position.x + sceneParms.sideClipPos;
    } else {
        clipPlane.constant = cloudGroup.position.x + sceneParms.isoClipPos;
    }
    fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
    controls.update();
}


function initGUI() {
    const gui = new GUI();

    /* Scene Positioning */
    const folderScene = gui.addFolder('Scene Positioning');

    // Initial GUI properties set to the iso view
    const propsScene = {
        cameraDist: sceneParms.offset,
        cameraRotX: sceneParms.isoX,
        cameraRotY: sceneParms.isoY,
        modelLat: sceneParms.isoLat,
        modelLon: sceneParms.isoLon,
        modelRot: sceneParms.isoRot,
        satHeight: satParms.height
    };

    const controllers = {}; // Object to store GUI controllers

    function getCameraRotation() {
        const crX = THREE.MathUtils.degToRad(propsScene.cameraRotX);
        const crY = THREE.MathUtils.degToRad(propsScene.cameraRotY);
        return new THREE.Euler(crX, crY, 0, 'XYZ');
    }

    // Store each controller reference
    controllers.cameraDist = folderScene.add(propsScene, 'cameraDist', 0.1, 30, 0.05).onChange(() => {
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });
    controllers.cameraRotX = folderScene.add(propsScene, 'cameraRotX', -180, 180, 1).onChange(() => {
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });
    controllers.cameraRotY = folderScene.add(propsScene, 'cameraRotY', -180, 180, 1).onChange(() => {
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });
    controllers.modelLat = folderScene.add(propsScene, 'modelLat', -90, 90, 1).onChange(() => {
        positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });
    controllers.modelLon = folderScene.add(propsScene, 'modelLon', -180, 180, 1).onChange(() => {
        positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });
    controllers.modelRot = folderScene.add(propsScene, 'modelRot', -45, 45, 0.1).onChange(() => {
        positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
        controls.update();
    });
    controllers.satHeight = folderScene.add(propsScene, 'satHeight', 0, 1, 0.01).onChange(() => {
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
    controllers.planePosition = folderClip.add(propsClip, 'planePosition', -10.0, 10.0, 0.01);

    // Define action functions for the profiles
    const actions = {
        viewIsoProfile: function () {
            // Set propsScene values to iso profile values
            sceneParms.viewType = 'iso';
            const cameraRot = getDefaultCameraRot()
            propsScene.cameraRotX = cameraRot.camX;
            propsScene.cameraRotY = cameraRot.camY;
            propsScene.modelLat = sceneParms.isoLat;
            propsScene.modelLon = sceneParms.isoLon;
            propsScene.modelRot = sceneParms.isoRot;

            // Update the scene
            positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
            fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
            setControlTarget();
            setSatelliteRenderOrder(satParms.numSatellites);

            // Update the GUI controllers to reflect the new values
            controllers.cameraRotX.updateDisplay();
            controllers.cameraRotY.updateDisplay();
            controllers.modelLat.updateDisplay();
            controllers.modelLon.updateDisplay();
            controllers.modelRot.updateDisplay();
            if (!useMultiFrusta) {
                controllers.planePosition.setValue(sceneParms.isoClipPos);
                controllers.planePosition.updateDisplay();
            }
        },
        viewSideProfile: function () {
            // Set propsScene values to side profile values
            sceneParms.viewType = 'side';
            const cameraRot = getDefaultCameraRot()
            propsScene.cameraRotX = cameraRot.camX;
            propsScene.cameraRotY = cameraRot.camY;
            propsScene.modelLat = sceneParms.sideLat;
            propsScene.modelLon = sceneParms.sideLon;
            propsScene.modelRot = sceneParms.sideRot;

            // Update the scene
            positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
            fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
            setControlTarget();
            setSatelliteRenderOrder(satParms.numSatellites);

            // Update the GUI controllers to reflect the new values
            controllers.cameraRotX.updateDisplay();
            controllers.cameraRotY.updateDisplay();
            controllers.modelLat.updateDisplay();
            controllers.modelLon.updateDisplay();
            controllers.modelRot.updateDisplay();
            if (!useMultiFrusta) {
                controllers.planePosition.setValue(sceneParms.isoClipPos);
                controllers.planePosition.updateDisplay();
            }
        }
    };
    if (useMultiFrusta) {
        propsScene.cameraDist = 13.5;
        controllers.cameraDist.updateDisplay();
        clipPlane.constant = cloudGroup.position.x + sceneParms.sideClipPos;
        actions.viewSideProfile();
    }
    // Add buttons to the GUI
    folderScene.add(actions, 'viewIsoProfile').name('View Iso Profile');
    folderScene.add(actions, 'viewSideProfile').name('View Side Profile');

    const folderCloud = gui.addFolder('Cloud Parameters');
    if (useGltf) {
        function cloudsChanged() {
            let primary = true;
            for (let model of cloudGroup.children) {
                model.traverse((node) => {
                    if (node instanceof THREE.Points) {
                        const uniforms = node.material.uniforms;
                        uniforms['uScale'].value = cloudParms.pointSize;
                        if (primary) {
                            uniforms['uCloudColor'].value = cloudParms.color;
                            primary = false;
                        } else {
                            uniforms['uCloudColor'].value = new THREE.Color(0xffffff);
                        }
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

    const satelliteFolder = gui.addFolder('Satellites');
    satelliteFolder.add(satParms, 'numSatellites', satParms.minSatellites, satParms.maxSatellites, 2).name('Number of Satellites').onChange(() => {
        // lil-gui defaults to even numbers when using an increment of 2, but we want odd numbers
        if (satParms.numSatellites % 2 === 0) {
            satParms.numSatellites -= 1;
        }
        updateSatellites();

        const cameraRot = getDefaultCameraRot()
        propsScene.cameraDist = cameraRot.camDist;
        propsScene.cameraRotX = cameraRot.camX;
        propsScene.cameraRotY = cameraRot.camY;
        controllers.cameraDist.updateDisplay();
        controllers.cameraRotX.updateDisplay();
        controllers.cameraRotY.updateDisplay();
        fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
        controls.update();
    });

    gui.add(renderParms, 'fps', 10, 60, 1).onChange(() => {
        renderParms.interval = 1000 / renderParms.fps;
    });
    gui.add({ capture: captureCanvasImage }, 'capture').name('Capture Canvas');
    gui.add({ captureSquare: captureSquareImage }, 'captureSquare').name('Capture Square Image');

    positionScene(propsScene.modelLat, propsScene.modelLon, propsScene.satHeight, propsScene.modelRot);
    moveLight(propsLight.posX, propsLight.posY, propsLight.posZ);
    const normalDir = new THREE.Vector3().copy(clipPlaneAxis).applyQuaternion(cloudGroup.quaternion).normalize();
    clipPlane.normal.copy(normalDir);
    if (useMultiFrusta) {
        clipPlane.constant = cloudGroup.position.x + sceneParms.sideClipPos;
    } else {
        clipPlane.constant = cloudGroup.position.x + sceneParms.isoClipPos;
    }
    fitCameraToObject(camera, cloudGroup, propsScene.cameraDist, getCameraRotation());
    controls.update();
}

function fitCameraToObject(camera, object, offset, rotation) {
    offset = offset || propsScene.offset;

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
        console.log(scene);
        renderer.render(scene, camera); // Render the scene
    }

    requestAnimationFrame(animate);
}

function captureCanvasImage() {
    // download a 4k render
    captureCanvas(3840, 2160);
}

function captureSquareImage() {
    // download a 2k square render
    captureCanvas(2000, 2000);
}

function captureCanvas(targetWidth, targetHeight) {
    // Store the current renderer size and aspect ratio to go back to it after
    // rendering at target res
    const originalWidth = renderer.domElement.width;
    const originalHeight = renderer.domElement.height;
    const originalAspect = camera.aspect;

    camera.aspect = targetWidth / targetHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(targetWidth, targetHeight, false);
    renderer.setPixelRatio(1);

    renderer.render(scene, camera);

    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `tomography_${sceneParms.viewType}view_${targetWidth}x${targetHeight}.png`;
    link.click(); // Trigger download

    camera.aspect = originalAspect;
    camera.updateProjectionMatrix();
    renderer.setSize(originalWidth, originalHeight, false);
    renderer.setPixelRatio(window.devicePixelRatio);

    renderer.render(scene, camera);
}
