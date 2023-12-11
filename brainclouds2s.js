var https = require('https')
var util = require('util')
/*
// Set up XMLHttpRequest.
XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
window = {
    XMLHttpRequest: XMLHttpRequest
};
XMLHttpRequest.UNSENT = 0;
XMLHttpRequest.OPENED = 1;
XMLHttpRequest.HEADERS_RECEIVED = 2;
XMLHttpRequest.LOADING = 3;
XMLHttpRequest.DONE = 4;

// Set up LocalStorage.
LocalStorage = require('node-localstorage/LocalStorage').LocalStorage;
os = require('os');
var configDir = os.homedir() + "/.bciot";
localStorage = new LocalStorage(configDir);
*/

// Constants
const SERVER_SESSION_EXPIRED = 40365    // Error code for expired session
const HEARTBEAT_INTERVALE_MS = 60 * 30 * 1000   // 30 minutes heartbeat interval

const STATE_DISCONNECTED = 0
const STATE_AUTHENTICATING = 1
const STATE_CONNECTED = 2

// WebSocket
WebSocket = require('ws')
var socket = null

var rttConnectionState = {
    CONNECTED: "Connected",
    DISCONNECTED: "Disconnected",
    CONNECTING: "Connecting",
    DISCONNECTING: "Disconnecting"
}
var rttConnectionStatus = rttConnectionState.DISCONNECTED
var rttConnectCallback = null
var DEFAULT_RTT_HEARTBEAT // Seconds
var rttHeartbeatId = null
var disconnectedWithReason = false
var disconnectMessage = null
var rttAuth = {}
var rttCallback = null
var debugEnabled = true
var appId = null
var sessionId = null

// Execute the S2S request
function s2sRequest(context, json, callback) {
    var postData = JSON.stringify(json)

    if (context.logEnabled) {
        console.log(`[S2S SEND ${context.appId}] ${postData}`)
    }

    var options = {
        host: context.url,
        path: '/s2sdispatcher',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': (new util.TextEncoder().encode(postData)).length
        }
    }

    var req = https.request(options, res => {
        var data = ''

        // A chunk of data has been recieved.
        res.on('data', chunk => {
            data += chunk
        })

        // The whole response has been received. Print out the result.
        res.on('end', () => {
            if (context.logEnabled) {
                console.log(`[S2S RECV ${context.appId}] ${data}`)
            }
            let responseData = null;
            if (data) {
                try {
                    responseData = JSON.parse(data);
                }
                catch (error) {
                    console.log(`[S2S Error parsing response data ${context.appId}] ${error}`)
                }
            }
            callCallback(context, responseData, callback)
        })
    }).on("error", err => {
        if (context.logEnabled) {
            console.log(`[S2S Error making request ${context.appId}] ${err.message}`)
        }
        callCallback(context, null, callback)
    })

    // write data to request body
    req.write(postData)
    req.end()
}

function startHeartbeat(context) {
    stopHeartbeat(context)
    context.heartbeatInternalId = setInterval(() => {
        if (context.logEnabled) {
            console.log("Heartbeat")
        }
        request(context, {
            service: "heartbeat",
            operation: "HEARTBEAT"
        }, (context, data) => {
            if (!(data && data.status === 200)) {
                exports.disconnect(context)
            }
        })
    }, HEARTBEAT_INTERVALE_MS)
}

function startRTTHeartbeat() {
    if (!rttHeartbeatId) {
        rttHeartbeatId = setInterval(function () {

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
        }, 1000 * DEFAULT_RTT_HEARTBEAT);
    }
}

function stopHeartbeat(context) {
    if (context.heartbeatInternalId) {
        clearInterval(context.heartbeatInternalId)
        context.heartbeatInternalId = null
    }
}

function authenticateInternal(context, callback) {
    packetId = 0
    context.state = STATE_AUTHENTICATING;

    let json = {
        packetId: packetId,
        messages: [
            {
                service: "authenticationV2",
                operation: "AUTHENTICATE",
                data: {
                    appId: context.appId,
                    serverName: context.serverName,
                    serverSecret: context.serverSecret
                }
            }
        ]
    }

    s2sRequest(context, json, (context, data) => {
        if (data && data.messageResponses && data.messageResponses.length > 0) {
            let message = data.messageResponses[0]

            if (data.messageResponses[0].status === 200) {
                context.state = STATE_CONNECTED
                context.packetId = data.packetId + 1
                context.sessionId = message.data.sessionId

                // Start heartbeat
                startHeartbeat(context)
            }
            else {
                failAllRequests(context, message);
            }

            callCallback(context, message, callback)
        }
        else {
            failAllRequests(context, null);
            exports.disconnect(context)
            callCallback(context, null, callback)
        }
    })
}

function reAuth(context) {
    authenticateInternal(context, (context, data) => {
        if (data) {
            context.requestQueue.push({ json: json, callback: callback });
            if (context.requestQueue.length > 0) {
                let nextRequest = context.requestQueue[0];
                request(context, nextRequest.json, nextRequest.callback)
            }
        }
    })
}

function queueRequest(context, json, callback) {
    context.requestQueue.push({ json: json, callback: callback });

    // If only 1 in the queue, then send the request immediately
    // Also make sure we're not in the process of authenticating
    if (context.requestQueue.length == 1 &&
        context.state != STATE_AUTHENTICATING) {
        request(context, json, callback)
    }
}

function failAllRequests(context, message) {
    
    // Callback to all queued messages
    let requestQueue = context.requestQueue;
    context.requestQueue = [];
    for (let request in context.requestQueue) {
        if (request.callback) {
            callCallback(context, message, request.callback);
        }
    }
}

function request(context, json, callback) {
    let packet = {
        packetId: context.packetId,
        sessionId: context.sessionId,
        messages: [json]
    }

    context.packetId++

    s2sRequest(context, packet, (context, data) => {
        if (data && data.status != 200 && data.reason_code === SERVER_SESSION_EXPIRED && context.retryCount < 3) {
            stopHeartbeat(context)
            context.authenticated = false
            context.retryCount++
            context.packetId = 0
            context.sessionId = null
            reAuth(context);
            return
        }

        if (data && data.messageResponses && data.messageResponses.length > 0) {
            callCallback(context, data.messageResponses[0], callback)
        }
        else {
            // Error that has no packets
            callCallback(context, data, callback)
        }

        // This request is complete and safe to remove from queue after invoking callback
        context.requestQueue.splice(0, 1); // Remove this request from the queue
        context.retryCount = 0;

        // Do next request in queue
        if (context.requestQueue.length > 0) {
            let nextRequest = context.requestQueue[0];
            request(context, nextRequest.json, nextRequest.callback)
        }
    })
}

/**
 * Invoke a given callback.
 * @param context S2S context object
 * @param data Content object to be sent
 * @param callback Function to be executed
 */
function callCallback(context, data, callback) {
    if (callback != null) {
        try {
            callback(context, data);
        }
        catch (error) {
            console.log(`[S2S Callback Error ${context.appId}] ${error}`)
        }
    }
}

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

function connect(context, host, port, auth, ssl){
    rttConnectionStatus = rttConnectionState.CONNECTING;
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

    rttConnectionStatus = rttConnectionState.CONNECTED

    socket = new WebSocket(uri);
    socket.addEventListener('error', onSocketError);
    socket.addEventListener('close', onSocketClose);
    socket.addEventListener('open', onSocketOpen);
    socket.addEventListener('message', onSocketMessage);
}

function onSocketOpen(e) {
    if (exports.isRTTEnabled()) { // This should always be true, but just in case user called disabled and we end up receiving the event anyway
        
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

        /*
        var browserName = getBrowserName();
        if (browserName) {
            request.data.system.browser = browserName;
        }
        */

        request.data.auth = rttAuth;

        if (debugEnabled) {
            console.log("WS SEND: " + JSON.stringify(request));
        }
        socket.send(JSON.stringify(request));
    }
}

function rttOnRecv(recv){
    if (debugEnabled) {
        console.log("WS RECV: " + JSON.stringify(recv));
    }

    if (rttCallback) {
        rttCallback(recv);
    }
}

function onSocketMessage(e) {
    if (exports.isRTTEnabled()) { // This should always be true, but just in case user called disabled and we end up receiving the even anyway
        var processResult = function (result) {
            if (result.service == "rtt") {
                if (debugEnabled) {
                    console.log("WS RECV: " + JSON.stringify(result));
                }
                if (result.operation == "CONNECT") {
                    DEFAULT_RTT_HEARTBEAT = result.data.heartbeatSeconds; //make default heartbeat match the heartbeat the server gives us
                    startRTTHeartbeat();
                
                    rttConnectCallback.success(result);
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
                rttOnRecv(result);
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

function onSocketClose(e) {
    if (exports.isRTTEnabled()) { // Don't spam errors if we get multiple ones
        rttConnectCallback.failure("close");
    }

    exports.disableRTT();
    if (disconnectedWithReason == true) {
        console.log("RTT:Disconnect" + JSON.stringify(disconnectMessage));
    }
}

function onSocketError(e) {
    if (exports.isRTTEnabled()) { // Don't spam errors if we get multiple ones
        rttConnectCallback.failure("error");
    }

    exports.disableRTT();
}

function requestClientConnection(context, callback) {
    let json = {
        service: "rttRegistration",
        operation: "REQUEST_SYSTEM_CONNECTION",
        data: {}
    }

    request(context, json, callback)
}

/*
 * Create a new S2S context
 * @param appId Application ID
 * @param serverName Server name
 * @param serverSecret Server secret key
 * @param url The server url to send the request to. Defaults to the default 
 *            brainCloud portal
 * @param autoAuth If sets to true, the context will authenticate on the
 *                 first request if it's not already. Otherwise,
 *                 authenticate() or authenticateSync() must be called
 *                 successfully first before doing requests. WARNING: This
 *                 used to be implied true.
 * 
 *                 It is recommended to put this to false, manually
 *                 call authenticate, and wait for a successful response
 *                 before proceeding with other requests.
 * @return A new S2S context
 */
exports.init = (appId, serverName, serverSecret, url, autoAuth) => {
    if (!url) {
        url = "api.braincloudservers.com"
    }

    return {
        url: url,
        appId: appId,
        serverName: serverName,
        serverSecret: serverSecret,
        logEnabled: false,
        state: STATE_DISCONNECTED,
        packetId: 0,
        sessionId: null,
        heartbeatInternalId: null,
        autoAuth: autoAuth ? true : false,
        retryCount: 0,
        requestQueue: []
    }
}

/*
 * Force disconnect a S2S session
 * @param context S2S context object returned by init
 */
exports.disconnect = context => {
    stopHeartbeat(context)
    context.state = STATE_DISCONNECTED
    context.retryCount = 0
    context.packetId = 0
    context.sessionId = null
    context.requestQueue = []
}

/*
 * Set wether S2S messages and errors are logged to the console
 * @param context S2S context object returned by init
 * @param enabled Will log if true. Default false
 */
exports.setLogEnabled = (context, enabled) => {
    context.logEnabled = enabled
}

/*
 * Authenticate
 * @param context S2S context object returned by init
 * @param callback Callback function with signature: (context, result)
 */
exports.authenticate = (context, callback) => {
    authenticateInternal(context, callback)
}

/*
 * Send an S2S request
 * @param context S2S context object returned by init
 * @param json Content object to be sent
 * @param callback Callback function with signature: (context, result)
 */
exports.request = (context, json, callback) => {
    if (context.state == STATE_DISCONNECTED && context.autoAuth) {
        authenticateInternal(context, (context, result) => {
            if (context.state == STATE_CONNECTED &&
                result && result.status == 200) {
                if (context.requestQueue.length > 0) {
                    let nextRequest = context.requestQueue[0];
                    request(context, nextRequest.json, nextRequest.callback)
                }
            }
        });
    }
    queueRequest(context, json, callback);
}

exports.enableRTT = (context, success, failure) => {
    disconnectedWithReason = false

    if(exports.isRTTEnabled() || rttConnectionStatus == rttConnectionState.CONNECTING){
        console.log("RTT is already connected/connecting")

        return;
    }
    else{
        rttConnectCallback = {
            success: success,
            failure: failure
        }

        rttConnectionStatus = rttConnectionState.CONNECTING

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
                        connect(context, endpoint.host, endpoint.port, result.data.auth, endpoint.ssl);
                        return;
                    }
                }
    
                // We didn't find websocket endpoint
                result.status = 0;
                result.status_message = "WebSocket endpoint missing";
                rttConnectionStatus = rttConnectionState.DISCONNECTED;
                rttConnectCallback.failure(result);
            }
            else {
                rttConnectionStatus = rttConnectionState.DISCONNECTED;
                rttConnectCallback.failure(result);
            }
        })
    }
}

exports.disableRTT = () => {
    if(!(exports.isRTTEnabled()) || rttConnectionStatus == rttConnectionState.DISCONNECTING){
        console.log("RTT is not enabled")
        
        return;
    }
    else{
        rttConnectionStatus = rttConnectionState.DISCONNECTING

        if(rttHeartbeatId){
            clearInterval(rttHeartbeatId)

            rttHeartbeatId = null
        }

        if (socket) {
            socket.removeEventListener('error', onSocketError);
            socket.removeEventListener('close', onSocketClose);
            socket.removeEventListener('open', onSocketOpen);
            socket.removeEventListener('message', onSocketMessage);

            socket.close()
            socket = null
        }

        rttConnectionStatus = rttConnectionState.DISCONNECTED
    }
}

exports.registerRTTRawCallback = (callback) => {
    rttCallback = callback
}

exports.deregisterRTTRawCallback = () => {
    rttCallback = null
}

exports.isRTTEnabled = () => {
    return rttConnectionStatus == rttConnectionState.CONNECTED
}
