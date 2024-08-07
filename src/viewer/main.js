// main.js
let container;
let camera, scene, renderer;
let model;

init();
animate();

function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.y = 100;
    camera.position.z = -300;
    

    renderer = new THREE.WebGLRenderer({
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor('#000011');
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    const loader = new THREE.GLTFLoader();
    loader.load('./ARM_28800s_QC.glb', function (gltf) {
        model = gltf.scene;
        rotateModel(model);
        scene.add(model);
    }, undefined, function (error) {
        console.error(error);
    });

    controls = new THREE.OrbitControls(camera, renderer.domElement);

    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function rotateModel(model) {
    // Rotate -90 degrees about the x, i.e., convert from z up to y up convention
    model.rotation.x = -Math.PI / 2.0;
    // Push the model back 200 units away from the camera (the camera is at z=-300)
    model.position.z += 200;
    // Push the model 200 units right relative to the camera
    model.position.x -= 200;
}

function animate() {
    requestAnimationFrame(animate);

    controls.update();

    renderer.render(scene, camera);
}
