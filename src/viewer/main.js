// main.js
import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let container, stats;
let camera, controls, scene, renderer;
let model, image_plane, clip_plane;

init();

function init() {

    container = document.createElement('div');
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(0, 100, -250);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setAnimationLoop(animate);
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    new GLTFLoader().load('./ARM_28800s_QC.gltf', function (gltf) {
        clip_plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), -100);
        model = gltf.scene;
        model.traverse((node) => {
            if (node instanceof THREE.Points) {
                node.material = createMaterial();
            }
        });
        positionModel(model);
        scene.add(model);
        initGUI();
    }, undefined, function (error) {
        console.error(`Failed to load point cloud model: ${error}`);
    });

    const textureLoader = new THREE.TextureLoader();

    // scene background, this is derived from an HDRI used for tonemapping but works okay as a background too
    textureLoader.load('./qwantani_puresky_4k.avif', function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        scene.background = texture;
    });

    const plane_geo = new THREE.PlaneGeometry(400, 400);
    textureLoader.load('./cloudrender_lowres.png', function (texture) {
        texture.colorSpace = THREE.SRGBColorSpace;
        const plane_mat = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide
        });
        image_plane = new THREE.Mesh(plane_geo, plane_mat);
        image_plane.rotation.x = -Math.PI / 2.0;
        scene.add(image_plane);
    });

    stats = new Stats();
    container.appendChild(stats.dom);

    controls = new OrbitControls(camera, renderer.domElement);

    window.addEventListener('resize', onWindowResize, false);
}

function createMaterial() {
    const vertexShader = `
        #include <clipping_planes_pars_vertex>

        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            // increasing the numerator increases the size of the points
            gl_PointSize = 500.0 / -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;

            #include <clipping_planes_vertex>
        }
    `;

    const fragmentShader = `
        #include <clipping_planes_pars_fragment>

        void main() {
            vec4 diffuseColor = vec4(1.0, 1.0, 1.0, 1.0);
            #include <clipping_planes_fragment>

            gl_FragColor = diffuseColor;
        }
    `;

    const material = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        clipping: true,
        clippingPlanes: [clip_plane]
    });

    return material;
}

function initGUI() {
    const gui = new GUI(),
        props = {
            get 'Enabled'() {
                return renderer.localClippingEnabled;
            },
            set 'Enabled'(v) {
                renderer.localClippingEnabled = v;
            },
            get 'Axis'() {
                if (clip_plane.normal == new THREE.Vector3(-1, 0, 0)) {

                }
                else if (clip_plane.normal == new THREE.Vector3(0, -1, 0)) {
                    return 'Y';
                }
                else {
                    return 'Z';
                }
            },
            set 'Axis'(v) {
                switch (v) {
                    case 'X':
                        clip_plane.normal.set(-1, 0, 0);
                        break;
                    case 'Y':
                        clip_plane.normal.set(0, -1, 0);
                        break;
                    case 'Z':
                        clip_plane.normal.set(0, 0, -1);
                        break;
                }
            },
            get 'Plane'() {
                return clip_plane.constant;
            },
            set 'Plane'(v) {
                clip_plane.constant = v;
            }
        };

    gui.add(props, 'Enabled');
    gui.add(props, 'Axis', ['X', 'Y', 'Z']);
    gui.add(props, 'Plane', -250, 250);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function positionModel(model) {
    // Rotate -90 degrees about the x, i.e., convert from z up to y up convention
    //model.rotation.x = -Math.PI / 2.0;
    // Push the model back 200 units away from the camera (the camera is at z=-300)
    model.position.z += 200;
    // Push the model 200 units right relative to the camera
    model.position.x -= 200;
}

function animate() {
    controls.update();

    stats.begin();
    renderer.render(scene, camera);
    stats.end();
}
