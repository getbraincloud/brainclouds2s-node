# brainclouds2s-node
brainCloud S2S client Node JS library


```
var brainclouds2s = require('brainclouds2s');

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

## Config Info

**App Id** is viewable on the **Design | Core App Info | Application IDs** page.

**Server Name** and **Server Secret** can be set on the **Design | Core App Info | S2S Config** page.

## Server Example

An example of creating a S2S connection with brainCloud can be found with the [Warstone](https://github.com/getbraincloud/examples-javascript) example, in the rsm folder.

## API Reference

Additional documentation on the S2S calls can be found [here](http://getbraincloud.com/apidocs/apiref/#s2s). 