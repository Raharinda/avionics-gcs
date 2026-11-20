import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { rocketAxes, sensorMountBasis, RFU_TO_SCENE, type SensorMount } from "../data/rocketAxes";
import type { RocketSceneState } from "../types/visualization";
import { createRenderScheduler } from "./renderScheduler";
function createAxisLabel(text: string, color: string) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    context.font = "bold 32px sans-serif";
    canvas.width = Math.ceil(context.measureText(text).width) + 24;
    canvas.height = 64;
    context.fillStyle = color;
    context.font = "bold 32px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, 32);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.scale.set(canvas.width / canvas.height * .28, .28, 1);
    return sprite;
}
function disposeSceneResources(root: THREE.Object3D, extraMaterials: THREE.Material[] = []) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(extraMaterials);
    root.traverse((object) => {
        const drawable = object as THREE.Mesh;
        if (drawable.geometry)
            geometries.add(drawable.geometry);
        if (drawable.material)
            for (const material of Array.isArray(drawable.material) ? drawable.material : [drawable.material])
                materials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => { (material as THREE.SpriteMaterial).map?.dispose(); material.dispose(); });
}
export function createRocketScene(canvas: HTMLCanvasElement, initial: RocketSceneState) {
    const mode = initial.mode;
    const darkMode = initial.darkMode || canvas.closest(".dark-mode") !== null;
    let sceneState = initial;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(darkMode ? "#252d35" : "#f7f9fa");
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(3.5, 2.6, 5.5);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 12;
    controls.target.set(0, 0, 0);
    controls.update();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const coordinateFrame = new THREE.Group();
    coordinateFrame.quaternion.set(...RFU_TO_SCENE);
    scene.add(coordinateFrame);
    const vehicle = new THREE.Group();
    coordinateFrame.add(vehicle);
    const model = new THREE.Group();
    vehicle.add(model);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: darkMode ? "#a4adb5" : "#dfe7ed", metalness: .55, roughness: .35, transparent: true });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: darkMode ? "#7f8992" : "#f15b3a", roughness: .5, transparent: true });
    const detailMaterial = new THREE.MeshStandardMaterial({ color: darkMode ? "#525d66" : "#59636e", metalness: .6, roughness: .3, transparent: true });
    if (mode === "sensor") {
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, .12), new THREE.MeshStandardMaterial({ color: darkMode ? "#7c858d" : "#176d57", roughness: .7 }));
        model.add(board);
        const chip = new THREE.Mesh(new THREE.BoxGeometry(.42, .42, .13), detailMaterial);
        chip.position.z = .1;
        model.add(chip);
        const label = createAxisLabel("MPU6050", darkMode ? "#d7dde2" : "#233a4f");
        label.position.set(0, -.75, .15);
        model.add(label);
    }
    else {
        // Cylinder/cone meshes are authored along Y; the RFU rocket nose is +Z.
        model.rotation.x = Math.PI / 2;
        model.add(new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, 1.65, 32), bodyMaterial));
        const nose = new THREE.Mesh(new THREE.ConeGeometry(.36, .85, 32), bodyMaterial);
        nose.position.y = 1.25;
        model.add(nose);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(.37, .37, .13, 32), accentMaterial);
        band.position.y = .45;
        model.add(band);
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.23, .15, .25, 24), detailMaterial);
        nozzle.position.y = -.95;
        model.add(nozzle);
        const shape = new THREE.Shape([new THREE.Vector2(0, -.6), new THREE.Vector2(.5, -.6), new THREE.Vector2(0, .2)]);
        const finGeometry = new THREE.ExtrudeGeometry(shape, { depth: .07, bevelEnabled: false });
        for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
            const fin = new THREE.Mesh(finGeometry, accentMaterial);
            fin.rotation.y = angle;
            fin.position.set(.33 * Math.cos(angle), -.15, -.33 * Math.sin(angle));
            model.add(fin);
        }
    }
    const axes = new THREE.Group();
    if (mode === "mounting")
        coordinateFrame.add(axes);
    else
        vehicle.add(axes);
    let axesKey = "";
    const updateAxes = (mount?: SensorMount) => {
        const key = mode !== "rocket" ? mode : `${mount?.noseAxis ?? "model"}:${mount?.rightAxis ?? "model"}`;
        if (key === axesKey)
            return;
        const changed = axesKey !== "";
        axesKey = key;
        disposeSceneResources(axes);
        axes.clear();
        const definitions = rocketAxes(mount);
        for (const definition of definitions) {
            const direction = new THREE.Vector3(...definition.direction);
            axes.add(new THREE.ArrowHelper(direction, new THREE.Vector3(), 1.75, definition.color));
            const label = createAxisLabel(definition.label, definition.color);
            label.position.copy(direction.multiplyScalar(2.05));
            axes.add(label);
        }
        return changed;
    };
    updateAxes(sceneState.mounting);
    const grid = new THREE.GridHelper(6, 12, darkMode ? "#5b6670" : "#a8b8c5", darkMode ? "#39444d" : "#e2e8ee");
    grid.position.y = -1.8;
    scene.add(grid);
    if (mode !== "mounting") {
        const up = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1.9, -1.6, 0), 1.4, darkMode ? "#aeb8c2" : "#667988");
        scene.add(up);
        const upLabel = createAxisLabel(mode === "sensor" ? "ATAS (+Z)" : "ACUAN (+Z)", darkMode ? "#aeb8c2" : "#667988");
        upLabel.position.set(-1.9, .1, 0);
        scene.add(upLabel);
    }
    scene.add(new THREE.HemisphereLight("#ffffff", "#a9b5bf", 2.5));
    const light = new THREE.DirectionalLight("#ffffff", 3);
    light.position.set(3, 5, 4);
    scene.add(light);
    let needsRender = true;
    let requestRender = () => { };
    const resize = () => {
        const width = canvas.clientWidth || 340, height = canvas.clientHeight || 280;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        needsRender = true;
        requestRender();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    let previous = 0;
    const target = new THREE.Quaternion();
    const mountingMatrix = new THREE.Matrix4();
    let previewKey = "";
    let inViewport = true;
    const scheduler = createRenderScheduler((now) => {
        const dt = previous && now - previous < 100 ? Math.min(.1, Math.max(0, (now - previous) / 1000)) : 1 / 60;
        previous = now;
        const state = sceneState;
        if (updateAxes(state.mounting)) {
            target.identity();
            vehicle.quaternion.identity();
            needsRender = true;
        }
        if (mode === "mounting") {
            const key = `${state.mounting?.noseAxis}:${state.mounting?.rightAxis}`;
            if (key !== previewKey) {
                previewKey = key;
                const basis = sensorMountBasis(state.mounting);
                if (basis)
                    target.setFromRotationMatrix(mountingMatrix.makeBasis(new THREE.Vector3(...basis.right), new THREE.Vector3(...basis.forward), new THREE.Vector3(...basis.up)));
                else
                    target.identity();
            }
        }
        else if (mode === "sensor") {
            const axis = new THREE.Vector3(state.sensorFace[0] === "X" ? 1 : 0, state.sensorFace[0] === "Y" ? 1 : 0, state.sensorFace[0] === "Z" ? 1 : 0);
            if (state.sensorFace[1] === "M")
                axis.negate();
            target.setFromUnitVectors(axis, new THREE.Vector3(0, 0, 1));
        }
        else if (state.quaternion && state.active) {
            const [w, x, y, z] = state.quaternion;
            target.set(x, y, z, w).normalize();
        }
        else if (state.active) {
            target.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(state.roll), THREE.MathUtils.degToRad(state.pitch), THREE.MathUtils.degToRad(state.yaw), "ZYX"));
        }
        const angleBefore = vehicle.quaternion.angleTo(target);
        if (angleBefore > 1e-7) {
            vehicle.quaternion.slerp(target, Math.min(1, dt * 18));
            if (vehicle.quaternion.angleTo(target) < 1e-5)
                vehicle.quaternion.copy(target);
            needsRender = true;
        }
        const opacity = state.active || mode !== "rocket" ? 1 : .35;
        if (bodyMaterial.opacity !== opacity)
            needsRender = true;
        bodyMaterial.opacity = opacity;
        accentMaterial.opacity = opacity;
        detailMaterial.opacity = opacity;
        const cameraMoving = controls.update();
        if (needsRender || cameraMoving) {
            renderer.render(scene, camera);
            needsRender = false;
        }
        return cameraMoving || vehicle.quaternion.angleTo(target) > 1e-5;
    }, { request: (callback) => requestAnimationFrame(callback), cancel: (id) => cancelAnimationFrame(id) });
    requestRender = scheduler.invalidate;
    let suspended = false;
    const updateVisibility = () => {
        const nextSuspended = sceneState.paused || document.hidden || !inViewport;
        if (suspended && !nextSuspended)
            needsRender = true;
        suspended = nextSuspended;
        scheduler.setPaused(suspended);
    };
    const onCameraChange = () => { needsRender = true; requestRender(); };
    controls.addEventListener("change", onCameraChange);
    document.addEventListener("visibilitychange", updateVisibility);
    const intersectionObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
        inViewport = entry.isIntersecting;
        updateVisibility();
    });
    intersectionObserver?.observe(canvas);
    updateVisibility();
    requestRender();
    return {
        update(next: RocketSceneState) { sceneState = next; updateVisibility(); requestRender(); },
        dispose() {
            scheduler.dispose();
            resizeObserver.disconnect();
            intersectionObserver?.disconnect();
            document.removeEventListener("visibilitychange", updateVisibility);
            controls.removeEventListener("change", onCameraChange);
            controls.dispose();
            disposeSceneResources(scene, [bodyMaterial, accentMaterial, detailMaterial]);
            renderer.dispose();
        },
    };
}
