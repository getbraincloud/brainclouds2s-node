# brainclouds2s-node
brainCloud S2S (server-to-server) client Node JS library

> **Package renamed.** This library now ships as **`@braincloud/s2s`** (the `@braincloud` npm scope). The old unscoped **[`brainclouds2s`](https://www.npmjs.com/package/brainclouds2s)** package is **deprecated** — switch your dependency to `@braincloud/s2s`. The API is unchanged; only the package name moved.
>
> **Building a game/app client instead?** This is the server-to-server library. For in-game/app calls use the companion package **[`@braincloud/client`](https://www.npmjs.com/package/@braincloud/client)** (formerly `braincloud`).

## Installation

```bash
npm install @braincloud/s2s
```

## Usage

```
var brainclouds2s = require('@braincloud/s2s');

// Fill in your needed app info
appId = "00000";
serverName = "myServerName";
serverSecret = "aaaaaaaa-bbbb-0000-cccc-111111111111";

var S2S = {}
S2S.context = brainclouds2s.init(appId, serverName, serverSecret);

// Example S2S Call
brainclouds2s.request(S2S.context, {
    service: "lobby",
    operation: "SYS_ROOM_ASSIGNED",
    data: {
        lobbyId: "...",
        connectInfo: {
            roomId: "...",
            url: "...",
            port: "...",
            wsPort: "..."
        }
    }
});

```

## Logging

Core S2S logs can be sent to a synchronous callback for each context:

```javascript
brainclouds2s.setLogCallback(S2S.context, (context, entry) => {
    console.log(context.appId, entry.level, entry.message);
    if (entry.responseBody !== undefined) {
        console.log(entry.responseBody);
    }
});
brainclouds2s.setLogEnabled(S2S.context, true);
```

Entries contain `level` (`debug` or `error`) and `message`, with optional `error`
and `responseBody` fields. Parse errors include the response body, using the
existing secret-key redaction unless `setShowSecretLogs(context, true)` is set.
Verbose request, response, transport-error and heartbeat logs still require
`setLogEnabled(context, true)`. Parse errors and request-callback errors are
reported even when verbose logging is disabled, as before.

Call `setLogCallback(context, null)` to restore the default console logging.
If a logging callback throws synchronously, the SDK reports that error to the
console and falls back to console logging so request processing can continue.
This callback covers core S2S logging; RTT, PRL and global-file logging retain
their existing behavior.

## Config Info

**App Id** is viewable on the **Design | Core App Info | Application IDs** page.

**Server Name** and **Server Secret** can be set on the **Design | Core App Info | S2S Config** page.

## Server Example

An example of creating a S2S connection with brainCloud can be found with the [Warstone](https://github.com/getbraincloud/examples-javascript) example, in the rsm folder.

## API Reference

Additional documentation on the S2S calls can be found [here](http://getbraincloud.com/apidocs/apiref/#s2s). 