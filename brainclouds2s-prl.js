'use strict';

//----------------------------------------------------
// brainCloud client source code
// Copyright 2026 bitHeads, inc.
//----------------------------------------------------

var brainclouds2s = require('./brainclouds2s');

/**
 * Handles the Pre-Ready Launch (PRL) flow for custom servers launched by brainCloud.
 *
 * When PRE_READY_LAUNCH is "true", the server must wait for the assigned lobby to
 * reach the "starting" state before proceeding with launch.
 *
 * Usage:
 *   const prl = require('./brainclouds2s-prl');
 *   if (prl.isPreReadyLaunch()) {
 *       brainclouds2s.authenticate(context, (ctx, result) => {
 *           prl.start(context, lobbyId, (proceed) => {
 *               if (proceed) { ... } else { process.exit(0); }
 *           });
 *       });
 *   }
 */

/**
 * Returns true if PRE_READY_LAUNCH environment variable is set to "true".
 */
exports.isPreReadyLaunch = () => {
    var val = process.env['PRE_READY_LAUNCH'];
    return val != null && val.toLowerCase() === 'true';
};

/**
 * Returns the timeout in seconds from PRL_TIMEOUT_SECS or
 * PRE_READY_LAUNCH_TIMEOUT_SECS environment variables. Defaults to 60.
 */
exports.getTimeoutSecs = () => {
    var val = process.env['PRL_TIMEOUT_SECS'];
    if (val) { var s = parseInt(val); if (!isNaN(s)) return s; }
    val = process.env['PRE_READY_LAUNCH_TIMEOUT_SECS'];
    if (val) { var s = parseInt(val); if (!isNaN(s)) return s; }
    return 60;
};

/**
 * Parses the SERVER_CONTEXT environment variable into an object.
 * Handles single-quoted and backslash-escaped JSON strings.
 */
exports.parseServerContext = () => {
    try {
        var val = process.env['SERVER_CONTEXT'] || '{}';
        val = val.trim().replace(/^'|'$/g, '').replace(/\\"/g, '"');
        return JSON.parse(val);
    } catch (e) {
        return {};
    }
};

/**
 * Builds the lobby RTT channel ID from the app ID and lobby ID.
 * Lobby ID format:  <appId>:<instanceId>
 * Channel format:   <appId>:sy:_lobby_<instanceId>
 */
function buildChannelId(appId, lobbyId) {
    var instanceId = lobbyId;
    var colonPos = lobbyId.indexOf(':');
    if (colonPos >= 0) instanceId = lobbyId.substring(colonPos + 1);
    return appId + ':sy:_lobby_' + instanceId;
}

/**
 * Parses the lobby state from a GET_LOBBY_DATA response.
 * @param {object} result - S2S response object
 * @returns {string|null} lobby state string, or null on failure
 */
function parseLobbyState(result) {
    try {
        if (!result || result.status !== 200) return null;
        return result.data.state || null;
    } catch (e) { return null; }
}

/**
 * Parses the lobby state from an RTT push message.
 * Expected format: { service: "chat", operation: "INCOMING", data: { content: { data: { lobby: { state: "..." } } } } }
 * @param {object} msg - RTT message object
 * @returns {string|null} lobby state string, or null if not a lobby state message
 */
function parseLobbyStateFromRTT(msg) {
    try {
        if (msg.service !== 'chat') return null;
        if (msg.operation !== 'INCOMING') return null;
        return msg.data.content.data.lobby.state || null;
    } catch (e) { return null; }
}

/**
 * Sends SYS_ROOM_SESSION_ENDED to notify brainCloud the server session has concluded.
 * Should be called before the server process exits.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {function} [callback] - Optional callback with signature (context, result)
 */
exports.sendSessionEnded = (context, callback) => {
    console.log('[S2S PRL] Sending SYS_ROOM_SESSION_ENDED.');
    brainclouds2s.request(context, {
        service: 'roomServer',
        operation: 'SYS_ROOM_SESSION_ENDED',
        data: {
            serverId: process.env['SERVER_ID'],
            serverContext: exports.parseServerContext()
        }
    }, callback || null);
};

/**
 * Starts the PRL flow. Assumes the S2S context is already authenticated.
 *
 * Flow:
 *   1. Enable RTT
 *   2. Subscribe to the lobby status channel (chat/CHANNEL_CONNECT)
 *   3. Notify brainCloud the room session has started (roomServer/SYS_ROOM_SESSION_STARTED)
 *   4. Query the lobby state (lobby/GET_LOBBY_DATA)
 *   5. If state is "starting" → proceed. If "disbanded" or not found → exit.
 *      Otherwise wait for an RTT push with the state transition.
 *
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} lobbyId - The lobby ID
 * @param {function} callback - Called with (proceed: boolean) when PRL is complete
 */
exports.start = (context, lobbyId, callback) => {
    var timeoutSecs = exports.getTimeoutSecs();
    var complete = false;
    var timeoutId = null;

    console.log('[S2S PRL] Starting PRL flow. lobbyId=' + lobbyId + ', timeoutSecs=' + timeoutSecs);

    function done(proceed) {
        if (complete) return;
        complete = true;
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        brainclouds2s.deregisterRTTRawCallback();
        callback(proceed);
    }

    if (timeoutSecs > 0) {
        timeoutId = setTimeout(() => {
            console.log('[S2S PRL] Timeout elapsed — exiting.');
            done(false);
        }, timeoutSecs * 1000);
    }

    function handleLobbyState(lobbyState) {
        if (lobbyState === null || lobbyState === undefined) {
            console.log('[S2S PRL] Lobby not found — exiting.');
            done(false);
        } else if (lobbyState === 'disbanded') {
            console.log('[S2S PRL] Lobby disbanded — exiting.');
            done(false);
        } else if (lobbyState === 'starting') {
            console.log('[S2S PRL] Lobby is starting — proceeding with launch.');
            done(true);
        } else {
            console.log('[S2S PRL] Lobby state is "' + lobbyState + '" — waiting for RTT update.');
        }
    }

    // Register RTT callback to receive lobby state push notifications
    brainclouds2s.registerRTTRawCallback((msg) => {
        console.log('[S2S PRL] RTT message: ' + JSON.stringify(msg));
        if (complete) return;
        var lobbyState = parseLobbyStateFromRTT(msg);
        if (lobbyState !== null) {
            console.log('[S2S PRL] RTT lobby state update: ' + lobbyState);
            handleLobbyState(lobbyState);
        }
    });

    // Step 1: Enable RTT
    brainclouds2s.enableRTT(context,
        (rttResult) => {
            var channelId = buildChannelId(context.appId, lobbyId);
            console.log('[S2S PRL] RTT connected. Subscribing to channel: ' + channelId);

            // Step 2: Subscribe to the lobby status channel
            brainclouds2s.request(context, {
                service: 'chat',
                operation: 'CHANNEL_CONNECT',
                data: {
                    channelId: channelId,
                    maxReturn: 50
                }
            }, (ctx, result) => {
                if (!result || result.status !== 200) {
                    console.log('[S2S PRL] Failed to subscribe to channel: ' + JSON.stringify(result));
                    done(false);
                    return;
                }
                console.log('[S2S PRL] Channel subscribed. Notifying session started.');

                // Step 3: Notify brainCloud the room session has started
                var serverContext = exports.parseServerContext();
                console.log('[S2S PRL] SERVER_CONTEXT = ' + JSON.stringify(serverContext));
                brainclouds2s.request(context, {
                    service: 'roomServer',
                    operation: 'SYS_ROOM_SESSION_STARTED',
                    data: {
                        serverId: process.env['SERVER_ID'],
                        serverContext: serverContext
                    }
                }, (ctx, result) => {
                    if (!result || result.status !== 200) {
                        console.log('[S2S PRL] SYS_ROOM_SESSION_STARTED failed: ' + JSON.stringify(result));
                        done(false);
                        return;
                    }
                    console.log('[S2S PRL] Session started. Querying lobby state.');

                    // Step 4: Query the current lobby state
                    brainclouds2s.request(context, {
                        service: 'lobby',
                        operation: 'GET_LOBBY_DATA',
                        data: { lobbyId: lobbyId }
                    }, (ctx, result) => {
                        var lobbyState = parseLobbyState(result);
                        console.log('[S2S PRL] Initial lobby state: ' + lobbyState);
                        handleLobbyState(lobbyState);
                    });
                });
            });
        },
        (err) => {
            console.log('[S2S PRL] RTT connection failed: ' + JSON.stringify(err));
            done(false);
        }
    );
};
