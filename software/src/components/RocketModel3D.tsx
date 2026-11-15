import { useEffect, useRef } from "react";
import * as THREE from "three";

type RocketModel3DProps = {
  roll: number;
  pitch: number;
  yaw: number;
};

export function RocketModel3D({ roll, pitch, yaw }: RocketModel3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orientationRef = useRef({ roll, pitch, yaw });

  useEffect(() => {
    orientationRef.current = { roll, pitch, yaw };
  }, [pitch, roll, yaw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f7f9fa");
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(3.2, 2.4, 5.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const rocket = new THREE.Group();
    rocket.rotation.order = "ZYX";
    scene.add(rocket);

    const metal = new THREE.MeshStandardMaterial({
      color: "#e9edf0",
      metalness: 0.55,
      roughness: 0.3,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: "#59636e",
      metalness: 0.7,
      roughness: 0.26,
    });
    const orange = new THREE.MeshStandardMaterial({
      color: "#f15b3a",
      metalness: 0.25,
      roughness: 0.35,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: "#477ef2",
      metalness: 0.2,
      roughness: 0.15,
    });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.65, 32), metal);
    body.castShadow = true;
    body.receiveShadow = true;
    rocket.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 32), metal);
    nose.position.y = 1.27;
    nose.castShadow = true;
    rocket.add(nose);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.16, 32), orange);
    band.position.y = 0.45;
    band.castShadow = true;
    rocket.add(band);

    const windowMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.025, 24),
      glass,
    );
    windowMesh.rotation.x = Math.PI / 2;
    windowMesh.position.set(0, 0.8, 0.41);
    rocket.add(windowMesh);

    const finGeometry = new THREE.ExtrudeGeometry(
      new THREE.Shape([
        new THREE.Vector2(0, -0.75),
        new THREE.Vector2(0.58, -0.75),
        new THREE.Vector2(0.42, 0.1),
        new THREE.Vector2(0, 0.35),
      ]),
      { depth: 0.1, bevelEnabled: false },
    );
    finGeometry.center();
    for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      const fin = new THREE.Mesh(finGeometry, orange);
      fin.rotation.y = angle;
      fin.position.y = -0.35;
      fin.position.z = 0.34;
      fin.castShadow = true;
      rocket.add(fin);
    }

    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.28, 24), darkMetal);
    nozzle.position.y = -1.02;
    nozzle.castShadow = true;
    rocket.add(nozzle);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.55, 20),
      new THREE.MeshBasicMaterial({ color: "#ff9f38", transparent: true, opacity: 0.82 }),
    );
    flame.position.y = -1.42;
    flame.scale.set(1, 0.7, 1);
    rocket.add(flame);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.8, 64),
      new THREE.MeshStandardMaterial({ color: "#e9edf0", transparent: true, opacity: 0.45 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.7;
    floor.receiveShadow = true;
    scene.add(floor);

    scene.add(new THREE.HemisphereLight("#ffffff", "#a9b5bf", 2.2));
    const keyLight = new THREE.DirectionalLight("#ffffff", 3);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const rimLight = new THREE.PointLight("#477ef2", 1.5, 8);
    rimLight.position.set(-3, 1, -3);
    scene.add(rimLight);

    const resize = () => {
      const width = canvas.clientWidth || 320;
      const height = canvas.clientHeight || 245;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let frame = 0;
    const animate = () => {
      const orientation = orientationRef.current;
      rocket.rotation.x = THREE.MathUtils.degToRad(orientation.pitch);
      rocket.rotation.y = THREE.MathUtils.degToRad(orientation.yaw);
      rocket.rotation.z = THREE.MathUtils.degToRad(orientation.roll);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    };
  }, []);

  return <canvas ref={canvasRef} className="rocket-model-3d" aria-label="3D rocket attitude model" />;
}
