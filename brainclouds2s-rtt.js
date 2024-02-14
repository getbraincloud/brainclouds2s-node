let S2S = require('./brainclouds2s.js');

var socket = null

var connectionState = {
    CONNECTED: "Connected",
    DISCONNECTED: "Disconnected",
    CONNECTING: "Connecting",
    DISCONNECTING: "Disconnecting"
}
var connectionStatus = connectionState.DISCONNECTED
var connectCallback = null
var DEFAULT_HEARTBEAT // Seconds
var heartbeatId = null
var disconnectedWithReason = false
var disconnectMessage = null
var rttAuth = {}
var rttCallback = null
var debugEnabled = true
var appId = null
var sessionId = null

/**
 * Sends a request to establish an RTT system connection.
 * @param {*} context object containing session data (appId, serverName, etc.)
 * @param {*} callback function to be invoked after request is sent
 */
function requestClientConnection(context, callback) {
    let requestJSON = {
        service: "rttRegistration",
        operation: "REQUEST_SYSTEM_CONNECTION",
        data: {}
    }

    S2S.request(context, requestJSON, callback)
}

/**
 * Creates a WebSocket connection.
 * @param {*} host endpoint URL
 * @param {*} port port number
 * @param {*} auth appId and secret
 * @param {*} ssl is ssl enabled
 */
function connect(host, port, auth, ssl) {
    connectionStatus = connectionState.CONNECTING;
    rttAuth = auth
    
    // build url with auth as arguments
    var uri = (ssl ? "wss://" : "ws://") + host + ":" + port;
    if (rttAuth) {
        uri += "?";
        var count = 0;
        for (var key in rttAuth) {
            if (count > 0) {
                uri += "&";
            }
            uri += key + "=" + rttAuth[key];
            ++count;
        }
    }

    connectionStatus = connectionState.CONNECTED

    socket = new WebSocket(uri);
    socket.addEventListener('error', onSocketError);
    socket.addEventListener('close', onSocketClose);
    socket.addEventListener('open', onSocketOpen);
    socket.addEventListener('message', onSocketMessage);
}

/**
 * Sends an RTT CONNECT request through the opened WebSocket connection.
 */
function onSocketOpen() {
    if (exports.rttIsEnabled()) { // This should always be true, but just in case user called disabled and we end up receiving the event anyway
        
        // Send a connect request
        var request = {
            operation: "CONNECT",
            service: "rtt",
            data: {
                appId: appId,
                profileId: "s",
                sessionId: sessionId,
                system: {
                    protocol: "ws",
                    platform: "WEB"
                }
            }
        };
        
        var browserName = getBrowserName();
        if (browserName) {
            request.data.system.browser = browserName;
        }
        
        request.data.auth = rttAuth;

        if (debugEnabled) {
            console.log("WS SEND: " + JSON.stringify(request));
        }
        socket.send(JSON.stringify(request));
    }
}

/**
 * Disables RTT and- if the user had not manually disabled RTT- returns a callback failure.
 */
function onSocketClose() {
    if (exports.rttIsEnabled()) { // Don't spam errors if we get multiple ones
        connectCallback.failure("close");
    }

    exports.disableRTT();
    if (disconnectedWithReason == true) {
        console.log("RTT:Disconnect" + JSON.stringify(disconnectMessage));
    }
}

/**
 * Disables RTT and- if the user had not manually disabled RTT- returns a callback failure.
 */
function onSocketError() {
    if (exports.rttIsEnabled()) { // Don't spam errors if we get multiple ones
        connectCallback.failure("error");
    }

    exports.disableRTT();
}

/**
 * Processes data received from the WebSocket connection and starts RTT heartbeat to keep connection alive.
 * @param {*} e event data
 */
function onSocketMessage(e) {
    if (exports.rttIsEnabled()) { // This should always be true, but just in case user called disabled and we end up receiving the even anyway
        var processResult = function (result) {
            if (result.service == "rtt") {
                if (debugEnabled) {
                    console.log("WS RECV: " + JSON.stringify(result));
                }
                if (result.operation == "CONNECT") {
                    DEFAULT_HEARTBEAT = result.data.heartbeatSeconds; //make default heartbeat match the heartbeat the server gives us
                    startHeartbeat();
                    
                    connectCallback.success(result);
                }
                else if (result.operation == "DISCONNECT") {
                    disconnectedWithReason = true;
                    disconnectMessage =
                    {
                        severity: "ERROR",
                        reason: result.data.reason,
                        reasonCode: result.data.reasonCode,
                        data: null
                    };
                }
            }
            else {
                onRecv(result);
            }
        };

        if (typeof e.data === "string") {
            processResult(e.data);
        } else if (typeof FileReader !== 'undefined') {
            
            // Web Browser
            var reader = new FileReader();
            reader.onload = function () {
                var parsed = {};
                try {
                    parsed = JSON.parse(reader.result);
                }
                catch (e) {
                    console.log("WS RECV: " + reader.result);
                    parsed = JSON.parse(reader.result); // Trigger the error again and let it fail
                }
                processResult(parsed);
            }
            reader.readAsText(e.data);
        } else {
            
            // Node.js
            var parsed = {};
            try {
                parsed = JSON.parse(e.data);
            }
            catch (e) {
                console.log("WS RECV: " + e.data);
                parsed = JSON.parse(e.data); // Trigger the error again and let it fail
            }
            processResult(parsed);
        }
    }
}

/**
 * Invokes rttCallback with data received through WebSocket message event
 * @param {*} recv message event data
 */
function onRecv(recv) {
    if (debugEnabled) {
        console.log("WS RECV: " + JSON.stringify(recv));
    }

    if (rttCallback) {
        rttCallback(recv);
    }
}

/**
 * Gets the name of the browser being used.
 * @returns name of browser
 */
function getBrowserName() {
    // Opera 8.0+
    var isOpera = (!!window.opr && !!opr.addons) || !!window.opera || (typeof navigator !== 'undefined' && navigator.userAgent.indexOf(' OPR/') >= 0);

    // Firefox 1.0+
    var isFirefox = typeof InstallTrigger !== 'undefined';

    // Safari 3.0+ "[object HTMLElementConstructor]" 
    var isSafari = /constructor/i.test(window.HTMLElement) || (function (p) { return p.toString() === "[object SafariRemoteNotification]"; })(!window['safari'] || (typeof safari !== 'undefined' && safari.pushNotification));

    // Internet Explorer 6-11
    var isIE = (typeof document !== 'undefined' && !!document.documentMode);

    // Edge 20+
    var isEdge = !isIE && !!window.StyleMedia;

    // Chrome 1+
    var isChrome = !!window.chrome && !!window.chrome.webstore;

    // Blink engine detection
    var isBlink = (isChrome || isOpera) && !!window.CSS;

    if (isOpera) return "opera";
    if (isFirefox) return "firefox";
    if (isSafari) return "safari";
    if (isIE) return "ie";
    if (isEdge) return "edge";
    if (isChrome) return "chrome";
    if (isBlink) return "blink";

    return null;
}

/**
 * Sends heartbeat request at a defined interval to maintain the WebSocket connection.
 */
function startHeartbeat() {
    if (!heartbeatId) {
        heartbeatId = setInterval(function () {

            // Send a heartbeat request
            var request = {
                operation: "HEARTBEAT",
                service: "rtt",
                data: null
            };

            if (debugEnabled) {
                console.log("WS SEND: " + JSON.stringify(request));
            }

            socket.send(JSON.stringify(request));
        }, 1000 * DEFAULT_HEARTBEAT);
    }
}

/**
 * Attempts to establish an RTT connection to the brainCloud servers.
 * @param {*} context object containing session data (appId, serverName, etc.)
 * @param {*} success function to be invoked when an RTT connection has been established
 * @param {*} failure function to be invoked if an RTT connection is not established
 * @returns if RTT is already enabled
 */
exports.enableRTT = (context, success, failure) => {
    disconnectedWithReason = false

    if(exports.rttIsEnabled() || connectionStatus == connectionState.CONNECTING){
        console.log("RTT is already connected/connecting")

        return;
    }
    else{
        connectCallback = {
            success: success,
            failure: failure
        }

        connectionStatus = connectionState.CONNECTING

        requestClientConnection(context, (context, result) => {
            if (context.logEnabled) {
                console.log(JSON.stringify(result))
            }
            if (result.status == 200) {
                for (var i = 0; i < result.data.endpoints.length; ++i) {
                    var endpoint = result.data.endpoints[i];
                    if (endpoint.protocol === "ws") {
                        appId = context.appId
                        sessionId = context.sessionId
                        connect(endpoint.host, endpoint.port, result.data.auth, endpoint.ssl);
                        return;
                    }
                }
    
                // We didn't find websocket endpoint
                result.status = 0;
                result.status_message = "WebSocket endpoint missing";
                connectionStatus = connectionState.DISCONNECTED;
                connectCallback.failure(result);
            }
            else {
                connectionStatus = connectionState.DISCONNECTED;
                connectCallback.failure(result);
            }
        })
    }
}

/**
 * Disables the RTT connection.
 * @returns if RTT is not enabled
 */
exports.disableRTT = () => {
    if(!(exports.rttIsEnabled()) || connectionStatus == connectionState.DISCONNECTING){
        console.log("RTT is not enabled")
        
        return;
    }
    else{
        connectionStatus = connectionState.DISCONNECTING

        if(heartbeatId){
            clearInterval(heartbeatId)

            heartbeatId = null
        }

        if (socket) {
            socket.removeEventListener('error', onSocketError);
            socket.removeEventListener('close', onSocketClose);
            socket.removeEventListener('open', onSocketOpen);
            socket.removeEventListener('message', onSocketMessage);

            socket.close()
            socket = null
        }

        connectionStatus = connectionState.DISCONNECTED
    }
}

/**
 * Returns whether or not RTT is enabled.
 * @returns True if RTT is enabled
 */
exports.rttIsEnabled = () => {
    return connectionStatus == connectionState.CONNECTED
}

/**
 * Registers a callback for all RTT services
 * @param {*} callback function to be invoked when receiving RTT updates
 */
exports.registerRTTRawCallback = (callback) => {
    rttCallback = callback
}

/**
 * Deregisters the RTT callback.
 */
exports.deregisterRTTRawCallback = () => {
    rttCallback = null
}