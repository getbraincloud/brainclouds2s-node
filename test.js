
const fs = require('fs')
let S2S = require('./brainclouds2s.js');

/**
 * Tests are running within NodeJS not a browser.
 *
 * As a result, we need to set up the global 'window' object and
 * initialize the XMLHttpRequest, WebSocket and LocalStorage facilities.
 */

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

// Set up WebSocket.
WebSocket = require('ws');

/*
// Set up LocalStorage.
LocalStorage = require('node-localstorage/LocalStorage').LocalStorage;
os = require('os');
var configDir = os.homedir() + "/.bciot";
localStorage = new LocalStorage(configDir);
*/

var fail_log = [];
var filters = process.argv[2];
console.log("filters: " + filters);

var GAME_ID = "";
var SECRET = "";
var GAME_VERSION = "";
var SERVER_URL = "";
var PARENT_LEVEL_NAME = "";
var CHILD_APP_ID = "";
var PEER_NAME = "";
var SERVER_NAME = "";
var SERVER_SECRET = "";
var S2S_URL = "";
loadIDs();

function loadIDs()
{
    let buffer = fs.readFileSync('ids.txt');
    let lines = buffer.toString().split("\n");
    let ids = lines.reduce((ids, line) =>
    {

        let keyVal = line.split("=");

        if(keyVal[0] !== undefined && keyVal[1] !== undefined) {
            let key = keyVal[0].trim();
            let value = keyVal[1].trim();

            if (key === "serverUrl")
            {
                // In javascript we remove the "dispatcherv2" after the url
                value = value.replace("/dispatcherv2", "");
            }

            ids[key] = value;
        }

        return ids;
    }, {});

    GAME_ID = ids.appId;
    SECRET = ids.secret;
    GAME_VERSION = ids.version;
    SERVER_URL = ids.serverUrl;
    PARENT_LEVEL_NAME = ids.parentLevelName;
    CHILD_APP_ID = ids.childAppId;
    CHILD_SECRET = ids.childSecret;
    PEER_NAME = ids.peerName;
    SERVER_NAME = ids.serverName;
    SERVER_SECRET = ids.serverSecret;
    S2S_URL = ids.s2sUrl.split('/')[2];

    console.log("ids.txt:");
    console.log("  GAME_ID: " + GAME_ID);
    console.log("  SECRET: " + SECRET);
    console.log("  GAME_VERSION: " + GAME_VERSION);
    console.log("  SERVER_URL: " + SERVER_URL);
    console.log("  PARENT_LEVEL_NAME: " + PARENT_LEVEL_NAME);
    console.log("  CHILD_APP_ID: " + CHILD_APP_ID);
    console.log("  CHILD_SECRET: " + CHILD_SECRET);
    console.log("  PEER_NAME: " + PEER_NAME);
    console.log("  SERVER_NAME: " + SERVER_NAME);
    console.log("  SERVER_SECRET: " + SERVER_SECRET);
    console.log("  S2S_URL: " + S2S_URL);
}

var module_beforeFn;
var module_afterFn;
var isModuleRunnable;
var module_name;
var test_name;
var test_count = 0;
var test_passed = 0;
var resolve_test;
var sub_testCount = 0;
var sub_testPass = 0;

function module(name, beforeFn, afterFn)
{
    module_name = name;
    module_beforeFn = beforeFn;
    module_afterFn = afterFn;
    isModuleRunnable = filters ? name.match(new RegExp(filters, "i")) : true;
    return isModuleRunnable;
}

async function asyncTest(name, expected, testFn)
{
    if (arguments.length === 2)
    {
        testFn = expected;
        expected = 1;
    }
    
    test_name = module_name + " : " + name;

    if (!isModuleRunnable)
    {
        // if (filters && !name.match(new RegExp(filters, "i")))
        // {
            return;
        // }
    }

    ++test_count;

    console.log("TEST: \x1b[36m" + test_name + "\x1b[0m");
    
    if (module_beforeFn)
    {
        try
        {
            await module_beforeFn();
        }
        catch (e)
        {
            console.log(e);
            process.exit(1);
        }
    }
    if (testFn)
    {
        sub_testPass = 0;
        
        try
        {
            await function()
            {
                return new Promise(resolve =>
                {
                    resolve_test = resolve;
                    testFn();
                });
            }();
        }
        catch (e)
        {
            console.log(e);
            resolve_test();
        }
                    
        if (sub_testPass === expected)
        {
            ++test_passed;
            console.log("\x1b[36m" + test_name + " \x1b[32m[PASSED]\x1b[0m (" + sub_testPass + " == " + expected + ")");
        }
        else
        {
            var log = "\x1b[36m" + test_name + " \x1b[31m[FAILED]\x1b[0m (" + sub_testPass + " != " + expected + ")";
            fail_log.push(log);
            console.log(log);
        }
    }
    if (module_afterFn)
    {
        try
        {
            await module_afterFn();
        }
        catch (e)
        {
            console.log(e);
            process.exit(1);
        }
    }
}

function passed(expr, log)
{
    ++sub_testPass;
    console.log("\x1b[36m" + test_name + " \x1b[32m[OK]\x1b[36m (" + expr + ")\x1b[0m" + log);
}

function failed(expr, logex)
{
    var log = "\x1b[36m" + test_name + " \x1b[31m[FAILED]\x1b[36m (" + expr + ")\x1b[0m" + logex;
    fail_log.push(log);
    console.log(log);
}

function ok(result, log)
{
    if (result) passed(result, log);
    else failed(result, log);
}

function equal(actual, expected, log)
{
    if (actual === expected) passed(actual + " == " + expected, log);
    else failed(actual + " != " + expected, log);
}

function greaterEq(actual, expected, log)
{
    if (actual >= expected) passed(actual + " >= " + expected, log);
    else failed(actual + " < " + expected, log);
}

async function run_tests()
{
    if (!module("S2S", null, null)) return;

    // Heartbeat test (This can be a long test, keep that commented for now)
    // When testing that, change HEARTBEAT_INTERVALE_MS to 10sec in brainclouds2s.js
    if (false)
    {
        await asyncTest("hearbeat", 2, () =>
        {
            let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false)
            S2S.setLogEnabled(s2s, true)
        
            S2S.authenticate(s2s, (s2s, result) =>
            {
                equal(result && result.status, 200, JSON.stringify(result));

                console.log(`Waiting for session to timeout for 25sec`)
                setTimeout(function() {
                    S2S.request(s2s, {
                        service: "script", 
                        operation: "RUN", 
                        data: {
                            scriptName: "testScript2" 
                        }
                    }, (s2s, result) =>
                    {
                        equal(result && result.status, 200, JSON.stringify(result));
                        resolve_test();
                    })
                }, 25 * 1000)
            })
        })
    }

    // Auto auth
    // if (false)
    {
        await asyncTest("runScriptWithAutoAuth", 1, () =>
        {
            let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, true)
            S2S.setLogEnabled(s2s, true)

            S2S.request(s2s, {
                service: "script", 
                operation: "RUN", 
                data: {
                    scriptName: "testScript2" 
                }
            }, (s2s, result) =>
            {
                equal(result && result.status, 200, JSON.stringify(result));
                resolve_test();
            })
        })

        await asyncTest("runManyScriptWithAutoAuth", 3, () =>
        {
            let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, true)
            S2S.setLogEnabled(s2s, true)

            // Queue many at once
            let doneCount = 0;
            for (let i = 0; i < 3; ++i)
                S2S.request(s2s, {
                    service: "script", 
                    operation: "RUN", 
                    data: {
                        scriptName: "testScript2" 
                    }
                }, (s2s, result) =>
                {
                    equal(result && result.status, 200, JSON.stringify(result));
                    ++doneCount;
                    if (doneCount == 3) resolve_test();
                })
        })

        await asyncTest("runScriptWithUnicodeWithAutoAuth", () =>
        {
            let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, true)
            S2S.setLogEnabled(s2s, true)

            S2S.request(s2s, {
                service: "script",
                operation: "RUN",
                data: {
                    scriptName: "testScript2", 
                    scriptData: {
                        profileIds: [
                            "Some profile ID"
                        ],
                        alertContent: {
                            body: "Player wysłał(a) ci zaproszenie do znajomych"
                        },
                        customData: {}
                    }
                }
            }, (s2s, result) =>
            {
                equal(result.status, 200, JSON.stringify(result));
                resolve_test();
            })
        })

        // This was to test a edge case, it's a very slow test that takes 2 hours
        // await asyncTest("heartbeat test WithAutoAuth", () =>
        // {
        //     setTimeout(() =>
        //     {
        //         S2S.request(s2s, {
        //             service: "script",
        //             operation: "RUN",
        //             data: {
        //                 scriptName: "testScript2", 
        //                 scriptData: {
        //                     profileIds: [
        //                         "Some profile ID"
        //                     ],
        //                     alertContent: {
        //                         body: "Player wysłał(a) ci zaproszenie do znajomych"
        //                     },
        //                     customData: {}
        //                 }
        //             }
        //         }, (s2s, result) =>
        //         {
        //             equal(result.status, 200, JSON.stringify(result));
        //             resolve_test();
        //         })
        //     }, 2 * 60 * 60 * 1000)
        // })
    }

    // auth
    // if (false)
    {
        await asyncTest("runScriptWithoutAuth", 1, () =>
        {
            let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false)
            S2S.setLogEnabled(s2s, true)
        
            S2S.request(s2s, {
                service: "script", 
                operation: "RUN", 
                data: {
                    scriptName: "testScript2" 
                }
            }, (s2s, result) =>
            {
                equal(result && result.status, 403, JSON.stringify(result));
                resolve_test();
            })
        })

        await asyncTest("runManyScriptWithoutAuth", 3, () =>
        {
            let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false)
            S2S.setLogEnabled(s2s, true)
        
            // Queue many at once
            let doneCount = 0;
            for (let i = 0; i < 3; ++i)
                S2S.request(s2s, {
                    service: "script", 
                    operation: "RUN", 
                    data: {
                        scriptName: "testScript2" 
                    }
                }, (s2s, result) =>
                {
                    equal(result && result.status, 403, JSON.stringify(result));
                    ++doneCount;
                    if (doneCount == 3)
                    {
                        resolve_test();
                    }
                })
        })

        await asyncTest("runScriptWithAuth", 2, () =>
        {
            let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false)
            S2S.setLogEnabled(s2s, true)
        
            S2S.authenticate(s2s, (s2s, result) =>
            {
                equal(result && result.status, 200, JSON.stringify(result));

                S2S.request(s2s, {
                    service: "script", 
                    operation: "RUN", 
                    data: {
                        scriptName: "testScript2" 
                    }
                }, (s2s, result) =>
                {
                    equal(result && result.status, 200, JSON.stringify(result));
                    resolve_test();
                })
            })
        })

        await asyncTest("runManyScriptWithAuth", 4, () =>
        {
            let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false)
            S2S.setLogEnabled(s2s, true)

            S2S.authenticate(s2s, (s2s, result) =>
            {
                equal(result && result.status, 200, JSON.stringify(result));

                // Queue many at once
                let doneCount = 0;
                for (let i = 0; i < 3; ++i)
                    S2S.request(s2s, {
                        service: "script", 
                        operation: "RUN", 
                        data: {
                            scriptName: "testScript2" 
                        }
                    }, (s2s, result) =>
                    {
                        equal(result && result.status, 200, JSON.stringify(result));
                        ++doneCount;
                        if (doneCount == 3) resolve_test();
                    })
            })
        })

        
        await asyncTest("RTT", 4, () => {
            let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false)
            let channelID = GAME_ID + ":sy:mysyschannel"
            let postChatJSON = {
                service: "chat",
                operation: "SYS_POST_CHAT_MESSAGE",
                data: {
                    channelId: channelID,
                    content: {
                        text: "Hello World",
                        custom: {
                            somethingCustom: "wow"
                        }
                    },
                    recordInHistory: false,
                    from: {
                        name: "Homer",
                        pic: "http://www.simpsons.test/homer.jpg"
                    }
                }
            }
            let channelConnectJSON = {
                service: "chat",
                operation: "SYS_CHANNEL_CONNECT",
                data: {
                    channelId: channelID,
                    maxReturn: 10
                }
            }
            let msgReceived = false

            S2S.setLogEnabled(s2s, true)

            S2S.authenticate(s2s, (s2s, result) => {
                equal(result && result.status, 200, "Authenticate: " + JSON.stringify(result))

                S2S.enableRTT(s2s, onRTTEnabled, (error) => {
                    console.log("enable RTT failed " + JSON.stringify(error))
                    resolve_test()
                })
            })

            function onRTTEnabled() {
                equal(S2S.isRTTEnabled(), true, "RTT enabled")
                S2S.registerRTTRawCallback(onRTTCallbackReceived)

                S2S.request(s2s, channelConnectJSON, onChannelConnectRequestSuccess)
            }

            function onChannelConnectRequestSuccess() {
                S2S.request(s2s, postChatJSON, (s2s, result) => {
                    console.log("Post Chat Msg Req success")
                })
            }

            function onRTTCallbackReceived(message) {
                if (message.service === "chat" && message.operation === "INCOMING") {
                    msgReceived = true
                }

                equal(msgReceived, true, "Received chat message - " + JSON.stringify(message))

                S2S.disableRTT()

                equal(S2S.isRTTEnabled(), false, "RTT disabled")

                resolve_test()
            }
        })
    }
}

async function main()
{
    await run_tests();

    console.log(((test_passed === test_count) ? "\x1b[32m[PASSED] " : "\x1b[31m[FAILED] ") + test_passed + "/" + test_count + " passed\x1b[0m");
    console.log(fail_log.join("\n"));

    process.exit(test_count - test_passed);
}

main();
