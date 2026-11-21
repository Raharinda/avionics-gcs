import type { CommandState } from "../types/telemetry";

export const DEFAULT_PULSE_MS = 200;
export const MAX_PULSE_MS = 10000;
export type GpioSnapshot = { state: CommandState; sent: boolean; message: string };
type Request = { id: string; durationMs: number };

export class Gpio19Command {
    private pending: Request | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private snapshot: GpioSnapshot = { state: "safe", sent: false, message: "" };
    constructor(
        private send: (line: string) => Promise<void>,
        private publish: (snapshot: GpioSnapshot) => void,
        private makeId = () => Array.from(crypto.getRandomValues(new Uint32Array(2)), n => n.toString(16).padStart(8, "0")).join(""),
    ) {}
    private update(state: CommandState, message: string, sent = false) {
        this.snapshot = { state, message, sent };
        this.publish(this.snapshot);
    }
    private clear() {
        clearTimeout(this.timer);
        this.pending = null;
    }
    dispose() { this.clear(); }
    arm() {
        if (this.snapshot.state === "safe") this.update("armed", "Armed — pilih durasi lalu FIRE untuk pulsa GPIO D19.");
    }
    disarm() {
        if (this.snapshot.state === "armed") this.update("safe", "Disarmed — kontrol FIRE dinonaktifkan.");
    }
    async fire(durationMs: number) {
        if (this.snapshot.state !== "armed" || this.pending) return;
        if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > MAX_PULSE_MS) {
            this.update("armed", `Durasi harus bilangan bulat 1–${MAX_PULSE_MS} ms.`); return;
        }
        await this.issue(durationMs);
    }
    async reset() {
        // LOW overrides any outstanding FIRE; a late FIRE ACK cannot complete Reset.
        if (this.pending?.durationMs === 0) return;
        await this.issue(0);
    }
    private async issue(durationMs: number) {
        this.clear();
        const request: Request = { id: this.makeId(), durationMs };
        this.pending = request;
        this.update("firing", durationMs ? `Mengirim pulsa D19 ${durationMs} ms — menunggu ACK avionics.` : "Reset D19 — menunggu konfirmasi LOW dari avionics.");
        this.timer = setTimeout(() => {
            if (this.pending !== request) return;
            this.clear();
            this.update("error", "ACK avionics belum diterima; keadaan D19 belum terkonfirmasi. Tekan Reset untuk meminta LOW.");
        }, 18000);
        try { await this.send(`D19_CMD:${request.id}:${durationMs}`); }
        catch (error) {
            if (this.pending !== request) return;
            this.clear();
            this.update("error", `Perintah D19 gagal: ${String(error)}. Tekan Reset untuk meminta LOW.`);
        }
    }
    receive(line: string) {
        const request = this.pending;
        if (!request) return;
        const match = /^D19_(ACK|SENT|ERROR):([0-9a-f]{16}):([^\r\n]+)$/.exec(line);
        if (!match || match[2] !== request.id) return;
        if (match[1] === "ERROR") {
            this.clear();
            this.update("error", `D19 ${match[3]} — belum ada konfirmasi output. Tekan Reset untuk meminta LOW.`);
        } else if (match[3] === String(request.durationMs)) {
            if (match[1] === "SENT") {
                this.update("firing", "Perintah dikirim lewat LoRa — menunggu ACK avionics.", true);
            } else {
                this.clear();
                this.update(request.durationMs ? "complete" : "safe", request.durationMs
                    ? `ACK avionics: pulsa HIGH 3,3 V D19 selama ${request.durationMs} ms dijalankan; otomatis LOW.`
                    : "ACK avionics: D19 LOW, urutan command direset.", true);
            }
        }
    }
}
