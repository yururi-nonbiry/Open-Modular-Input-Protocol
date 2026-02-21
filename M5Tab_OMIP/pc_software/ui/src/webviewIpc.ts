// Expose global types for WebView2 and our custom IPC
declare global {
    interface Window {
        chrome: any;
    }
}

export const WebviewIpc = {
    invoke: (command: string, ...args: any[]): Promise<any> => {
        return new Promise((resolve, reject) => {
            if (!window.chrome || !window.chrome.webview) {
                reject(new Error("WebView2 environment not found"));
                return;
            }

            // Create a temporary listener for the response
            const listener = (event: any) => {
                try {
                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

                    // Check if this response is for our request (we might need the backend to echo the ID, 
                    // but for now we'll naively resolve on the first matching command response)
                    const cmdType = data.command || data.event_name || data.type;

                    // Derive expected response command name
                    // e.g. 'serial:get_ports' -> 'get_ports'
                    const expectedCmd = command.includes(':') ? command.split(':')[1] : command;

                    if (cmdType === expectedCmd) {
                        window.chrome.webview.removeEventListener('message', listener);
                        if (data.status === 'error') {
                            reject(new Error(data.message));
                        } else {
                            // Return the whole object or a specific payload
                            if (expectedCmd === 'get_ports') resolve(data.ports);
                            else if (expectedCmd === 'get') resolve(data.config);
                            else resolve(data);
                        }
                    } else if (expectedCmd === 'save' && data.command === 'save_config') {
                        window.chrome.webview.removeEventListener('message', listener);
                        resolve(data);
                    } else if (expectedCmd === 'set_page' && data.command === 'set_page') {
                        window.chrome.webview.removeEventListener('message', listener);
                        resolve(data);
                    } else if (expectedCmd === 'connect' && data.command === 'connect') {
                        window.chrome.webview.removeEventListener('message', listener);
                        if (data.status === 'error') reject(new Error(data.message));
                        else resolve(data);
                    } else if (expectedCmd === 'disconnect' && data.command === 'disconnect') {
                        window.chrome.webview.removeEventListener('message', listener);
                        resolve(data);
                    } else if (expectedCmd === 'upload' && data.command === 'send_image') {
                        window.chrome.webview.removeEventListener('message', listener);
                        if (data.status === 'error') reject(new Error(data.message));
                        else resolve(data);
                    } else if (expectedCmd === 'get' && data.command === 'get_devices') {
                        window.chrome.webview.removeEventListener('message', listener);
                        resolve(data.devices);
                    } else if (expectedCmd === 'register' && data.command === 'register_device') {
                        window.chrome.webview.removeEventListener('message', listener);
                        if (data.status === 'error') reject(new Error(data.message));
                        else resolve(data.device);
                    } else if (expectedCmd === 'unregister' && data.command === 'unregister_device') {
                        window.chrome.webview.removeEventListener('message', listener);
                        if (data.status === 'error') reject(new Error(data.message));
                        else resolve(data.id);
                    }
                } catch (e) {
                    // Ignore parse errors from other messages
                }
            };

            window.chrome.webview.addEventListener('message', listener);

            // Map the string commands back to the JSON format the C# controller expects
            let payload: any = {};
            if (command === 'serial:get_ports') payload = { command: 'get_ports' };
            else if (command === 'serial:connect') payload = { command: 'connect', port: args[0] };
            else if (command === 'serial:disconnect') payload = { command: 'disconnect' };
            else if (command === 'config:get') payload = { command: 'get_config' };
            else if (command === 'config:save') payload = { command: 'save_config', config: args[0] };
            else if (command === 'config:set_page') payload = { command: 'set_page', page: args[0] };
            else if (command === 'image:upload') payload = { command: 'send_image', ...args[0] };
            else if (command === 'devices:get') payload = { command: 'get_devices' };
            else if (command === 'devices:register') payload = { command: 'register_device', deviceType: args[0].type, name: args[0].name };
            else if (command === 'devices:unregister') payload = { command: 'unregister_device', id: args[0] };

            window.chrome.webview.postMessage(JSON.stringify(payload));

            // Timeout to prevent hanging
            setTimeout(() => {
                window.chrome.webview.removeEventListener('message', listener);
                reject(new Error("WebView2 IPC timeout"));
            }, 5000);
        });
    },

    on: (_channel: string, callback: (event: any, data: any) => void) => {
        if (!window.chrome || !window.chrome.webview) return;

        // We attach properties to the callback so we can remove it later
        const listener = (event: any) => {
            try {
                const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
                // Emulate the IPC event structure
                callback({}, data);
            } catch (e) { }
        };

        (callback as any)._wv2Listener = listener;
        window.chrome.webview.addEventListener('message', listener);
    },

    off: (_channel: string, callback: (event: any, data: any) => void) => {
        if (!window.chrome || !window.chrome.webview) return;
        if ((callback as any)._wv2Listener) {
            window.chrome.webview.removeEventListener('message', (callback as any)._wv2Listener);
        }
    }
};

// Inject only if running in WebView2
if (typeof window !== 'undefined' && window.chrome && window.chrome.webview) {
    if (!(window as any).ipcRenderer) {
        (window as any).ipcRenderer = WebviewIpc;
    }
}
