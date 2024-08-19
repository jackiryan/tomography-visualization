// main.js
import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let container, stats;
let camera, controls, scene, renderer;
let model;

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
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    new GLTFLoader().load('./ARM_28800s_QC.gltf', function (gltf) {
        model = gltf.scene;
        model.traverse((node) => {
            if (node instanceof THREE.Points) {
                node.material = createMaterial();
            }
        });
        positionModel(model);
        scene.add(model);
    }, undefined, function (error) {
        console.error(`Failed to load point cloud model: ${error}`);
    });

    new THREE.TextureLoader().load('./qwantani_puresky_4k.avif', function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        scene.background = texture;
    });

    stats = new Stats();
    container.appendChild(stats.dom);

    controls = new OrbitControls(camera, renderer.domElement);

    window.addEventListener('resize', onWindowResize, false);
}

function createMaterial() {
    const vertexShader = `
        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            // increasing the numerator increases the size of the points
            gl_PointSize = 500.0 / -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    const fragmentShader = `
        void main() {
            gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
        }
    `;

    const material = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });
    return material;
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
    requestAnimationFrame(animate);

    controls.update();
    stats.update();

    renderer.render(scene, camera);
}
