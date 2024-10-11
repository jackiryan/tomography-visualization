
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import oceanVertexShader from './shaders/ocean/oceanVertex.glsl';
import oceanFragmentShader from './shaders/ocean/oceanFragment.glsl';
import atmVertexShader from './shaders/atm/atmVertex.glsl';
import atmFragmentShader from './shaders/atm/atmFragment.glsl';

let container, camera, controls, scene, renderer;
let imagePlane, ground, atm;

const groundSize = 1;
const groundPosition = new THREE.Vector3(0, 0, 0);

await init();
animate();

async function init() {

    container = document.createElement('div');
    document.body.appendChild(container);

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 5000);
    camera.position.set(0, 2, 0);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);

    renderer = new THREE.WebGLRenderer({
        antialias: true
    });
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
    const sunDir = new THREE.Vector3(-10, 10, 0);
    sunDir.normalize();
    dirLight.rotation.set(0, 0, 3 * Math.PI / 4);
    scene.add(dirLight);

    controls = new OrbitControls(camera, renderer.domElement);

    const textureLoader = new THREE.TextureLoader();
    const planeGeo = new THREE.PlaneGeometry(1, 1);
    textureLoader.load('./MISR_40m_radiance_nadir_2048x2048.png', async (texture) => {
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
    });

    const groundGeo = new THREE.SphereGeometry(groundSize, 128, 128);
    const atmGeo = new THREE.SphereGeometry(groundSize * 1.001, 128, 128);
    const groundMat = new THREE.ShaderMaterial({
        vertexShader: oceanVertexShader,
        fragmentShader: oceanFragmentShader,
        uniforms: {
            uSunDirection: new THREE.Uniform(sunDir),
            uDayColor: new THREE.Uniform(new THREE.Color(0x083471))
        }
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
    ground.position.copy(groundPosition);
    atm.position.copy(groundPosition);

    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    controls.update();
    renderer.render(scene, camera);

    requestAnimationFrame(animate);
}