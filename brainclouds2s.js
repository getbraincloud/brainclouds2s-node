var https = require('https')

// Constants
const SERVER_SESSION_EXPIRED = 40365          // Error code for expired session
const HEARTBEAT_INTERVALE_MS = 60 * 30 * 1000 // 30 minutes heartbeat interval

// Execute the S2S request
function s2sRequest(context, json, callback)
{
    var postData = JSON.stringify(json)

    if (context.logEnabled)
    {
        console.log(`[S2S SEND ${context.appId}] ${postData}`)
    }

    var options = {
        host: context.url,
        path: '/s2sdispatcher',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    }

    var req = https.request(options, res =>
    {
        var data = ''
        
        // A chunk of data has been recieved.
        res.on('data', chunk =>
        {
            data += chunk
        })
        
        // The whole response has been received. Print out the result.
        res.on('end', () =>
        {
            if (context.logEnabled)
            {
                console.log(`[S2S RECV ${context.appId}] ${data}`)
            }
            if (callback)
            {
                if (data)
                {
                    let dataJson = JSON.parse(data)
                    callback(context, dataJson)
                }
                else
                {
                    callback(context, null)
                }
            }
        })
    }).on("error", err =>
    {
        if (context.logEnabled)
        {
            console.log(`[S2S Error ${context.appId}] ${err.message}`)
        }
        if (callback)
        {
            callback(context, null)
        }
    })

    // write data to request body
    req.write(postData)
    req.end()
}

function startHeartbeat(context)
{
    stopHeartbeat(context)
    context.heartbeatInternalId = setInterval(() =>
    {
        request({
            service: "heartbeat",
            operation: "HEARTBEAT",
            data: null
        }, data =>
        {
            if (!(data && data.status === 200))
            {
                exports.disconnect(context)
            }
        })
    }, HEARTBEAT_INTERVALE_MS)
}

function stopHeartbeat(context)
{
    if (context.heartbeatInternalId)
    {
        clearInterval(context.heartbeatInternalId)
        context.heartbeatInternalId = null
    }
}

function authenticate(context, callback)
{
    packetId = 0

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

    s2sRequest(context, json, (context, data) =>
    {
        if (data && data.messageResponses && data.messageResponses.length > 0 && data.messageResponses[0].status === 200)
        {
            let message = data.messageResponses[0]

            context.authenticated = true
            context.packetId = data.packetId + 1
            context.sessionId = message.data.sessionId

            // Start heartbeat
            startHeartbeat(context)

            callback(context, message)
        }
        else
        {
            exports.disconnect(context)
            callback(context, null)
        }
    })
}

function request(context, json, callback)
{
    let packet = {
        packetId: context.packetId,
        sessionId: context.sessionId,
        messages: [json]
    }

    context.packetId++

    s2sRequest(context, packet, (context, data) =>
    {
        if (data && data.status != 200 && data.reason_code === SERVER_SESSION_EXPIRED)
        {
            exports.disconnect(context)
            exports.request(context, json, callback) // Redo the request, it will try to authenticate again
            return
        }

        if (callback)
        {
            callback(context, data.messageResponses[0])
        }
    })
}

/*
 * Create a new S2S context
 * @param appId Application ID
 * @param serverName Server name
 * @param serverSecret Server secret key
 * @param url The server url to send the request to. Defaults to the default 
 *            brainCloud portal
 * @return A new S2S context
 */
exports.init = (appId, serverName, serverSecret, url) =>
{
    if (!url)
    {
        url = "sharedprod.braincloudservers.com"
    }

    return {
        url: url,
        appId: appId,
        serverName: serverName,
        serverSecret: serverSecret,
        logEnabled: false,
        authenticated: false,
        packetId: 0,
        sessionId: "",
        heartbeatInternalId: null
    }
}

/*
 * Force disconnect a S2S session
 * @param context S2S context object returned by init
 */
exports.disconnect = context =>
{
    stopHeartbeat(context)
    context.authenticated = false
}

/*
 * Set wether S2S messages and errors are logged to the console
 * @param context S2S context object returned by init
 * @param enabled Will log if true. Default false
 */
exports.setLogEnabled = (context, enabled) =>
{
    context.logEnabled = enabled
}

/*
 * Send an S2S request
 * @param context S2S context object returned by init
 * @param json Content object to be sent
 * @param callback Callback function with signature: (context, result)
 */
exports.request = (context, json, callback) =>
{
    if (context.authenticated)
    {
        request(context, json, callback)
    }
    else
    {
        authenticate(context, data =>
        {
            if (data)
            {
                request(context, json, callback)
            }
            else if (callback)
            {
                callback(context, null)
            }
        })
    }
}
