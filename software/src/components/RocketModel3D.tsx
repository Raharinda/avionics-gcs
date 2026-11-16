import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { FaceId, Quaternion } from "../types/imu";
import { rocketAxes, sensorMountBasis, type SensorMount } from "../data/rocketAxes";

type Props = {
  roll?: number; pitch?: number; yaw?: number;
  quaternion?: Quaternion | null;
  active?: boolean;
  mode?: "rocket" | "sensor" | "mounting";
  sensorFace?: FaceId;
  mounting?: SensorMount;
};

function axisLabel(text: string, color: string) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = "bold 32px sans-serif";
  canvas.width = Math.ceil(context.measureText(text).width) + 24; canvas.height = 64;
  context.fillStyle = color; context.font = "bold 32px sans-serif";
  context.textAlign = "center"; context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(canvas.width / canvas.height * .28, .28, 1);
  return sprite;
}

function disposeObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const drawable = object as THREE.Mesh;
    if (drawable.geometry) geometries.add(drawable.geometry);
    if (drawable.material) for (const material of Array.isArray(drawable.material) ? drawable.material : [drawable.material]) materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => { (material as THREE.SpriteMaterial).map?.dispose(); material.dispose(); });
}

export function RocketModel3D({ roll = 0, pitch = 0, yaw = 0, quaternion = null, active = true, mode = "rocket", sensorFace = "ZP", mounting }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef({ roll, pitch, yaw, quaternion, active, sensorFace, mounting });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { current.current = { roll, pitch, yaw, quaternion, active, sensorFace, mounting }; }, [roll, pitch, yaw, quaternion, active, sensorFace, mounting]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
    catch { setError("WebGL tidak tersedia. Data orientasi tetap bisa dibaca pada angka X/Y/Z."); return; }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f7f9fa");
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(3.5, 2.6, 5.5);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.enablePan = false;
    controls.minDistance = 3; controls.maxDistance = 12;
    controls.target.set(0, 0, 0); controls.update();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const vehicle = new THREE.Group(); scene.add(vehicle);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#dfe7ed", metalness: .55, roughness: .35, transparent: true });
    const orange = new THREE.MeshStandardMaterial({ color: "#f15b3a", roughness: .5, transparent: true });
    const dark = new THREE.MeshStandardMaterial({ color: "#59636e", metalness: .6, roughness: .3, transparent: true });
    if (mode === "sensor") {
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, .12), new THREE.MeshStandardMaterial({ color: "#176d57", roughness: .7 }));
      vehicle.add(board);
      const chip = new THREE.Mesh(new THREE.BoxGeometry(.42, .42, .13), dark);
      chip.position.z = .1; vehicle.add(chip);
      const label = axisLabel("MPU6050", "#233a4f"); label.position.set(0, -.75, .15); vehicle.add(label);
    } else {
      vehicle.add(new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, 1.65, 32), bodyMaterial));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(.36, .85, 32), bodyMaterial);
      nose.position.y = 1.25; vehicle.add(nose);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.37, .37, .13, 32), orange);
      band.position.y = .45; vehicle.add(band);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.23, .15, .25, 24), dark);
      nozzle.position.y = -.95; vehicle.add(nozzle);
      const shape = new THREE.Shape([new THREE.Vector2(0, -.6), new THREE.Vector2(.5, -.6), new THREE.Vector2(0, .2)]);
      const finGeometry = new THREE.ExtrudeGeometry(shape, { depth: .07, bevelEnabled: false });
      for (const angle of [0, Math.PI/2, Math.PI, 3*Math.PI/2]) {
        const fin = new THREE.Mesh(finGeometry, orange);
        fin.rotation.y = angle; fin.position.set(.33*Math.cos(angle), -.15, -.33*Math.sin(angle)); vehicle.add(fin);
      }
    }
    const axes = new THREE.Group();
    if (mode === "mounting") scene.add(axes); else vehicle.add(axes);
    let axesKey = "";
    const updateAxes = (mount?: SensorMount) => {
      const key = mode !== "rocket" ? mode : `${mount?.noseAxis ?? "model"}:${mount?.rightAxis ?? "model"}`;
      if (key === axesKey) return;
      const changed = axesKey !== "";
      axesKey = key;
      disposeObjects(axes); axes.clear();
      const definitions = mode !== "rocket" ? [
        { direction: [1,0,0] as const, label: "+X sensor", color: "#dd483a" },
        { direction: [0,1,0] as const, label: "+Y sensor", color: "#228c53" },
        { direction: [0,0,1] as const, label: "+Z sensor", color: "#356ce0" },
      ] : rocketAxes(mount);
      for (const definition of definitions) {
        const direction = new THREE.Vector3(...definition.direction);
        axes.add(new THREE.ArrowHelper(direction, new THREE.Vector3(), 1.75, definition.color));
        const label = axisLabel(definition.label, definition.color);
        label.position.copy(direction.multiplyScalar(2.05)); axes.add(label);
      }
      return changed;
    };
    updateAxes(current.current.mounting);
    const grid = new THREE.GridHelper(6, 12, "#a8b8c5", "#e2e8ee"); grid.position.y = -1.8; scene.add(grid);
    if (mode !== "mounting") {
      const up = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(-1.9,-1.6,0), 1.4, "#667988"); scene.add(up);
      const upLabel = axisLabel(mode === "sensor" ? "UP" : "ACUAN", "#667988"); upLabel.position.set(-1.9, .1, 0); scene.add(upLabel);
    }
    scene.add(new THREE.HemisphereLight("#ffffff", "#a9b5bf", 2.5));
    const light = new THREE.DirectionalLight("#ffffff", 3); light.position.set(3,5,4); scene.add(light);
    const resize = () => {
      const width = canvas.clientWidth || 340, height = canvas.clientHeight || 280;
      renderer.setSize(width, height, false); camera.aspect = width/height; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    let frame = 0, previous = performance.now();
    const target = new THREE.Quaternion();
    const mountingMatrix = new THREE.Matrix4();
    let previewKey = "";
    const animate = (now: number) => {
      const dt = Math.min(.1, Math.max(0, (now-previous)/1000)); previous = now;
      const value = current.current;
      if (updateAxes(value.mounting)) { target.identity(); vehicle.quaternion.identity(); }
      if (mode === "mounting") {
        const key = `${value.mounting?.noseAxis}:${value.mounting?.rightAxis}`;
        if (key !== previewKey) {
          previewKey = key;
          const basis = sensorMountBasis(value.mounting);
          if (basis) target.setFromRotationMatrix(mountingMatrix.makeBasis(new THREE.Vector3(...basis.right), new THREE.Vector3(...basis.nose), new THREE.Vector3(...basis.third)));
          else target.identity();
        }
      } else if (mode === "sensor") {
        const axis = new THREE.Vector3(value.sensorFace[0] === "X" ? 1 : 0, value.sensorFace[0] === "Y" ? 1 : 0, value.sensorFace[0] === "Z" ? 1 : 0);
        if (value.sensorFace[1] === "M") axis.negate();
        target.setFromUnitVectors(axis, new THREE.Vector3(0,1,0));
      } else if (value.quaternion && value.active) {
        const [w,x,y,z] = value.quaternion; target.set(x,y,z,w).normalize();
      } else if (value.active) {
        target.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(value.roll), THREE.MathUtils.degToRad(value.pitch), THREE.MathUtils.degToRad(value.yaw), "ZYX"));
      }
      vehicle.quaternion.slerp(target, Math.min(1, dt*18));
      const opacity = value.active || mode !== "rocket" ? 1 : .35;
      bodyMaterial.opacity = opacity; orange.opacity = opacity; dark.opacity = opacity;
      controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      disposeObjects(scene);
      renderer.dispose();
    };
  }, [mode]);
  if (error) return <div className="model-error" role="alert">{error}</div>;
  return <canvas ref={canvasRef} className="rocket-model-3d" aria-label={mode === "sensor" ? "Panduan posisi sensor 3D" : mode === "mounting" ? "Pratinjau hidung roket pada sumbu sensor tetap" : "Orientasi relatif roket 3D"} />;
}
