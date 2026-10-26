/* eslint-env browser */ import getDevServer from '../utils/getDevServer';
if (__DEV__) {
    const socket = (()=>{
        const devServer = getDevServer();
        if (!devServer.bundleLoadedFromServer) {
            console.warn('Cannot create devtools websocket connections in embedded environments');
            return null;
        }
        const devServerUrl = new URL(devServer.url);
        const serverScheme = devServerUrl.protocol === 'https:' ? 'wss' : 'ws';
        return new WebSocket(`${serverScheme}://${devServerUrl.host}/message`);
    })();
    if (socket) {
        socket.onmessage = (message)=>{
            const data = JSON.parse(String(message.data));
            switch(data.method){
                case 'sendDevCommand':
                    switch(data.params.name){
                        case 'rsc-reload':
                            if (data.params.platform && data.params.platform !== process.env.EXPO_OS) {
                                return;
                            }
                            if (!globalThis.__EXPO_RSC_RELOAD_LISTENERS__) {
                            // server function-only mode
                            } else {
                                globalThis.__EXPO_RSC_RELOAD_LISTENERS__?.forEach((l)=>l());
                            }
                            break;
                    }
                    break;
            }
        };
    }
}

//# sourceMappingURL=messageSocket.native.js.map
