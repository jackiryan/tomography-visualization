// main.js
import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NRRDLoader } from 'three/examples/jsm/loaders/NRRDLoader.js';
import { Sky } from './sky.js';
import cloudVertexShader from './shaders/clouds/cloudVertex.glsl';
import cloudFragmentShader from './shaders/clouds/cloudFragment.glsl';


let container, stats;
let camera, controls, scene, renderer;
let model, image_plane, clip_plane, ground;
let sky, sun;

await init();

async function init() {

    container = document.createElement('div');
    document.body.appendChild(container);

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(90, aspect, 0.1, 5000);
    camera.position.set(0, 1, 1);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    stats = new Stats();
    container.appendChild(stats.dom);

    controls = new OrbitControls(camera, renderer.domElement);

    new NRRDLoader().load('./ARM_28800s_QC.nrrd', async function (volume) {
        clip_plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.4);
        const texture = new THREE.Data3DTexture(volume.data, 400, 400, 400);
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
            clippingPlanes: [clip_plane]
        });

        model = new THREE.Mesh(geometry, material);
        model.position.set(0, 0.5, 0);
        scene.add(model);

        await initSky().then(() => {
            initGUI();
            renderer.setAnimationLoop(animate);
        });

    }, undefined, function (error) {
        console.error(`Failed to load point cloud data: ${error}`);
    });

    const textureLoader = new THREE.TextureLoader();
    const plane_geo = new THREE.PlaneGeometry(1, 1);
    textureLoader.load('./MISR_40m_radiance_nadir_2048x2048.png', function (texture) {
        texture.colorSpace = THREE.SRGBColorSpace;
        const plane_mat = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide
        });
        image_plane = new THREE.Mesh(plane_geo, plane_mat);
        image_plane.rotation.x = -Math.PI / 2.0;
        scene.add(image_plane);
    });

    const ground_size = 1000; // for spherical ground
    const ground_geo = new THREE.PlaneGeometry(ground_size, ground_size);
    const ground_mat = new THREE.MeshBasicMaterial({
        color: 0x0a539e
    });
    ground = new THREE.Mesh(ground_geo, ground_mat);
    //scene.add(ground);
    ground.rotation.x = -Math.PI / 2.0;
    ground.position.set(0, -2, 0);

    window.addEventListener('resize', onWindowResize, false);
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
            if (clip_plane.normal.x === -1) {
                return 'X';
            }
            else if (clip_plane.normal.y === -1) {
                return 'Y';
            }
            else if (clip_plane.normal.z === -1) {
                return 'Z';
            }
        },
        set 'axis'(v) {
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
        get 'planePosition'() {
            return clip_plane.constant;
        },
        set 'planePosition'(v) {
            clip_plane.constant = v;
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
    const folderCloud = gui.addFolder('Cloud Parameters');
    const propsCloud = {
        qcThreshold: 1.0,
        opacity: 100.0,
        range: 0.0,
        raymarchSteps: 200
    }

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

    function cloudsChanged() {
        const uniforms = model.material.uniforms;
        uniforms['threshold'].value = propsCloud.qcThreshold / 100.0;
        uniforms['opacity'].value = propsCloud.opacity / 100.0;
        uniforms['range'].value = propsCloud.range;
        uniforms['steps'].value = propsCloud.raymarchSteps;
    }

    folderClip.add(propsClip, 'enabled');
    folderClip.add(propsClip, 'axis', ['X', 'Y', 'Z']);
    folderClip.add(propsClip, 'planePosition', -1.0, 1.0, 0.01);

    folderCloud.add(propsCloud, 'qcThreshold', 0, 100, 0.1).onChange(cloudsChanged);
    folderCloud.add(propsCloud, 'opacity', 0, 100, 0.1).onChange(cloudsChanged);
    folderCloud.add(propsCloud, 'range', 0, 1, 0.01).onChange(cloudsChanged);
    folderCloud.add(propsCloud, 'raymarchSteps', 0, 500, 1).onChange(cloudsChanged);

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
    model.material.uniforms.cameraPos.value.copy(camera.position);
    controls.update();

    stats.begin();
    renderer.render(scene, camera);
    stats.end();
}
