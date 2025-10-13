declare global {
  interface Window {
    ipcRenderer?: {
      send: (channel: string, ...args: any[]) => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
      off: (channel: string, listener: (...args: any[]) => void) => void;
    };
  }
}

// To make this file a module and allow global declarations.
export {};
