
const fs = require('fs')
let S2S = require('./brainclouds2s.js');
let GFV3 = require('./brainclouds2s-globalfilev3.js');

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
    console.log("  SECRET: [REDACTED]");
    console.log("  GAME_VERSION: " + GAME_VERSION);
    console.log("  SERVER_URL: " + SERVER_URL);
    console.log("  PARENT_LEVEL_NAME: " + PARENT_LEVEL_NAME);
    console.log("  CHILD_APP_ID: " + CHILD_APP_ID);
    console.log("  CHILD_SECRET: [REDACTED]");
    console.log("  PEER_NAME: " + PEER_NAME);
    console.log("  SERVER_NAME: " + SERVER_NAME);
    console.log("  SERVER_SECRET: [REDACTED]");
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
                equal(S2S.rttIsEnabled(), true, "RTT enabled")
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

                equal(S2S.rttIsEnabled(), false, "RTT disabled")

                resolve_test()
            }
        })
    }
}

async function run_globalfilev3_tests()
{
    if (!module("GlobalFileV3", null, null)) return;

    // Shared state: captured from SysCreateFolder and UploadGlobalFile responses
    var gfv3FolderTreeId = "";
    var gfv3FileId = "";
    var gfv3FileVersion = 1;

    // Test 1 (parity: dotnet #8): SysGetGlobalFileList
    await asyncTest("sysGetGlobalFileList", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysGetGlobalFileList(s2s, "", true, (s2s, result) =>
            {
                equal(result && result.status, 200, "SysGetGlobalFileList: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 2 (parity: dotnet #9): SysLookupFolder
    await asyncTest("sysLookupFolder", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysLookupFolder(s2s, "s2s_test_folder", (s2s, result) =>
            {
                equal(result && result.status, 200, "SysLookupFolder: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 3 (parity: dotnet #10): SysCreateFolder — captures treeId
    await asyncTest("sysCreateFolder", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysCreateFolder(s2s, "s2s_test_folder", -1, "s2s_test_folder_2",
                "S2S integration test folder", false, (s2s, result) =>
            {
                if (result && result.status === 200 && result.data && result.data.createdTreeId) {
                    gfv3FolderTreeId = result.data.createdTreeId;
                }
                equal(result && result.status, 200, "SysCreateFolder: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 4 (parity: dotnet #11): UploadGlobalFile — captures fileId and version
    await asyncTest("uploadGlobalFile", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.setLogEnabled(s2s, true);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            var fileData = Buffer.from("Hello from brainCloud S2S file upload test!");
            GFV3.uploadGlobalFile(s2s, gfv3FolderTreeId, "s2s_test_file.txt", true, fileData,
                (s2s, result) =>
            {
                if (result && result.status === 200 &&
                    result.data && result.data.fileDetails && result.data.fileDetails.fileDetails) {
                    var fd = result.data.fileDetails.fileDetails;
                    gfv3FileId = fd.fileId || gfv3FileId;
                    gfv3FileVersion = fd.version || gfv3FileVersion;
                }
                equal(result && result.status, 200, "UploadGlobalFile: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 5 (parity: dotnet #12): SysGetFileInfo
    await asyncTest("sysGetFileInfo", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysGetFileInfo(s2s, gfv3FileId, (s2s, result) =>
            {
                equal(result && result.status, 200, "SysGetFileInfo: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 6 (parity: dotnet #13): SysGetFileInfoSimple
    await asyncTest("sysGetFileInfoSimple", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysGetFileInfoSimple(s2s, "s2s_test_folder/s2s_test_folder_2", "s2s_test_file.txt",
                (s2s, result) =>
            {
                equal(result && result.status, 200, "SysGetFileInfoSimple: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 7 (parity: dotnet #14): SysCheckFilenameExists
    await asyncTest("sysCheckFilenameExists", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysCheckFilenameExists(s2s, "s2s_test_folder/s2s_test_folder_2", "s2s_test_file.txt",
                (s2s, result) =>
            {
                equal(result && result.status, 200, "SysCheckFilenameExists: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 8 (parity: dotnet #15): SysCheckFullpathFilenameExists
    await asyncTest("sysCheckFullpathFilenameExists", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysCheckFullpathFilenameExists(s2s,
                "s2s_test_folder/s2s_test_folder_2/s2s_test_file.txt", (s2s, result) =>
            {
                equal(result && result.status, 200,
                    "SysCheckFullpathFilenameExists: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 9 (parity: dotnet #16): SysGetGlobalCDNUrl
    await asyncTest("sysGetGlobalCDNUrl", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysGetGlobalCDNUrl(s2s, gfv3FileId, (s2s, result) =>
            {
                equal(result && result.status, 200, "SysGetGlobalCDNUrl: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 10 (parity: dotnet #17): SysCopyGlobalFile
    await asyncTest("sysCopyGlobalFile", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysCopyGlobalFile(s2s, gfv3FileId, gfv3FileVersion, gfv3FolderTreeId, -1,
                "s2s_file_copy.txt", true, (s2s, result) =>
            {
                equal(result && result.status, 200, "SysCopyGlobalFile: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 11 (parity: dotnet #18): SysMoveGlobalFile
    await asyncTest("sysMoveGlobalFile", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysMoveGlobalFile(s2s, gfv3FileId, gfv3FileVersion, gfv3FolderTreeId, -1,
                "s2s_file_moved.txt", true, (s2s, result) =>
            {
                equal(result && result.status, 200, "SysMoveGlobalFile: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 12 (parity: dotnet #19): SysRenameFolder
    await asyncTest("sysRenameFolder", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysRenameFolder(s2s, gfv3FolderTreeId, -1, "s2s_test_folder_renamed", (s2s, result) =>
            {
                equal(result && result.status, 200, "SysRenameFolder: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 13 (parity: dotnet #20): SysDeleteGlobalFiles — cleanup files
    await asyncTest("sysDeleteGlobalFiles", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysDeleteGlobalFiles(s2s, gfv3FolderTreeId,
                "s2s_test_folder/s2s_test_folder_renamed", -1, true, (s2s, result) =>
            {
                equal(result && result.status, 200, "SysDeleteGlobalFiles: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });

    // Test 14 (parity: dotnet #21): SysDeleteFolder — cleanup folder
    await asyncTest("sysDeleteFolder", 2, () =>
    {
        let s2s = S2S.init(GAME_ID, SERVER_NAME, SERVER_SECRET, S2S_URL, false);
        S2S.authenticate(s2s, (s2s, result) =>
        {
            equal(result && result.status, 200, "Auth: " + JSON.stringify(result));
            GFV3.sysDeleteFolder(s2s, gfv3FolderTreeId,
                "s2s_test_folder/s2s_test_folder_renamed", -1, true, (s2s, result) =>
            {
                equal(result && result.status, 200, "SysDeleteFolder: " + JSON.stringify(result));
                resolve_test();
            });
        });
    });
}

async function main()
{
    await run_tests();
    await run_globalfilev3_tests();

    console.log(((test_passed === test_count) ? "\x1b[32m[PASSED] " : "\x1b[31m[FAILED] ") + test_passed + "/" + test_count + " passed\x1b[0m");
    console.log(fail_log.join("\n"));

    process.exit(test_count - test_passed);
}

main();
