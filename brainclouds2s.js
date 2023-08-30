var https = require('https')
var util = require('util')

// Constants
const SERVER_SESSION_EXPIRED = 40365    // Error code for expired session
const HEARTBEAT_INTERVALE_MS = 60 * 30 * 1000   // 30 minutes heartbeat interval

const STATE_DISCONNECTED = 0
const STATE_AUTHENTICATING = 1
const STATE_CONNECTED = 2

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
            if (callback) {
                if (data) {

                    try {
                        let dataJson = JSON.parse(data)
                        callCallback(callback, context, dataJson)
                    }
                    catch (error) {
                        if (context.logEnabled) {
                            console.log(`[S2S Error ${context.appId}] ${error}`)
                        }
                        if (callback) {
                            callCallback(callback, context, null)
                        }
                    }

                }
                else {
                    callCallback(callback, context, null)
                }
            }
        })
    }).on("error", err => {
        if (context.logEnabled) {
            console.log(`[S2S Error ${context.appId}] ${err.message}`)
        }
        if (callback) {
            callCallback(callback, context, null)
        }
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

            if (callback)
                callCallback(callback, context, message)
        }
        else {
            failAllRequests(context, null);
            exports.disconnect(context)
            if (callback)
                callCallback(callback, context, null)
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
            callCallback(request.callback, context, message);
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

        if (callback) {
            if (data && data.messageResponses && data.messageResponses.length > 0) {
                callCallback(callback, context, data.messageResponses[0])
            }
            else {
                
                // Error that has no packets
                callCallback(callback, context, data)
            }
        }

        // This request is complete and safe to remove from queue after checking for callback
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
 * @param callback Function to be executed
 * @param context S2S context object
 * @param data Content object to be sent
 */
function callCallback(callback, context, data) {
    if (callback != null) {
        try {
            callback(context, data);
        }
        catch (error) {
            console.log(`[S2S Error ${context.appId}] ${error}`)
        }
    }
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
