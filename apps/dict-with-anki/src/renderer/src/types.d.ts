import type { IElectronAPI } from "../../../dist-types/src/preload/index";

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
