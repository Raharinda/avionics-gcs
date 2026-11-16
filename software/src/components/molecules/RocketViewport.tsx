import { lazy, memo, Suspense } from "react";
import type { RocketModelProps } from "../../types/visualization";
const RocketModel3D = lazy(() => import("./RocketModel3D").then((module) => ({ default: module.RocketModel3D })));
export const RocketViewport = memo(function RocketViewport(props: RocketModelProps) {
    const label = props.mode === "sensor" ? "Panduan posisi sensor 3D" : props.mode === "mounting" ? "Pratinjau hidung roket pada sumbu sensor tetap" : "Orientasi relatif roket 3D";
    return <Suspense fallback={<canvas className="rocket-model-3d" aria-label={label}/>}><RocketModel3D {...props}/></Suspense>;
});
