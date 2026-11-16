import { useEffect, useRef, useState } from "react";
import { createRocketScene } from "../../../visualization/createRocketScene";
import type { RocketModelProps, RocketSceneState } from "../../../types/visualization";
export function RocketModel3D({ roll = 0, pitch = 0, yaw = 0, quaternion = null, active = true, mode = "rocket", sensorFace = "ZP", mounting, paused = false }: RocketModelProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<ReturnType<typeof createRocketScene> | null>(null);
    const current = useRef<RocketSceneState>({ roll, pitch, yaw, quaternion, active, mode, sensorFace, mounting, paused });
    current.current = { roll, pitch, yaw, quaternion, active, mode, sensorFace, mounting, paused };
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!canvasRef.current)
            return;
        try {
            sceneRef.current = createRocketScene(canvasRef.current, current.current);
        }
        catch {
            setError("WebGL tidak tersedia. Data orientasi tetap bisa dibaca pada angka X/Y/Z.");
        }
        return () => { sceneRef.current?.dispose(); sceneRef.current = null; };
    }, [mode]);
    useEffect(() => { sceneRef.current?.update(current.current); }, [roll, pitch, yaw, quaternion, active, sensorFace, mounting?.noseAxis, mounting?.rightAxis, paused]);
    if (error)
        return <div className="model-error" role="alert">{error}</div>;
    return <canvas ref={canvasRef} className="rocket-model-3d" aria-label={mode === "sensor" ? "Panduan posisi sensor 3D" : mode === "mounting" ? "Pratinjau hidung roket pada sumbu sensor tetap" : "Orientasi relatif roket 3D"}/>;
}
