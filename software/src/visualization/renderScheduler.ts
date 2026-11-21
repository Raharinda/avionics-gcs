type FrameApi = {
    request: (callback: (time: number) => void) => number;
    cancel: (id: number) => void;
};
// A resting model has no pending animation frame. Multiple changes share one draw.
export function createRenderScheduler(draw: (time: number) => boolean, frames: FrameApi) {
    let frame: number | null = null;
    let paused = false;
    let disposed = false;
    const invalidate = () => {
        if (disposed || paused || frame !== null)
            return;
        frame = frames.request((time) => {
            frame = null;
            if (disposed || paused)
                return;
            if (draw(time))
                invalidate();
        });
    };
    const cancelFrame = () => { if (frame !== null)
        frames.cancel(frame); frame = null; };
    return {
        invalidate,
        setPaused(next: boolean) {
            if (next === paused)
                return;
            paused = next;
            if (paused)
                cancelFrame();
            else
                invalidate();
        },
        dispose() { disposed = true; cancelFrame(); },
    };
}
