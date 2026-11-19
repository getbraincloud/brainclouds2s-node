'use strict';
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { readFileSync } = require('node:fs')
const { test } = require('node:test')
const { runInNewContext } = require('node:vm')

const source = readFileSync(require.resolve('../brainclouds2s'), 'utf8')
const success = JSON.stringify({
    packetId: 0,
    messageResponses: [{ status: 200, data: { sessionId: 'session-id' } }]
})

function createClient(responseBody = success, requestError) {
    const sdk = {}
    const output = { log: [], error: [] }
    let heartbeat
    const transport = {
        Agent: class {},
        request(options, onResponse) {
            const request = new EventEmitter()
            request.write = () => {}
            request.end = () => {
                if (requestError) {
                    request.emit('error', requestError)
                    return
                }
                const response = new EventEmitter()
                onResponse(response)
                response.emit('data', responseBody)
                response.emit('end')
            }
            return request
        }
    }
    runInNewContext(source, {
        exports: sdk,
        require(name) {
            if (name === 'https') return transport
            if (name === './brainclouds2s-rtt') return {}
            return require(name)
        },
        console: {
            log: (...args) => output.log.push(args),
            error: (...args) => output.error.push(args)
        },
        setInterval(callback) { heartbeat = callback; return 1 },
        clearInterval() { heartbeat = undefined }
    }, { filename: 'brainclouds2s.js' })
    const context = sdk.init('app-one', 'server', 'server-secret')
    const send = (callback, target = context) => sdk.request(target, {
        service: 'test', operation: 'READ', data: { token: 'request-secret' }
    }, callback)
    return { sdk, context, output, send, tick: () => heartbeat() }
}

for (const enabled of [false, true]) {
    test(`console defaults retain verbose logging = ${enabled}`, () => {
        const { sdk, context, output, send } = createClient()
        sdk.setLogEnabled(context, enabled)
        let result
        send((actualContext, response) => {
            assert.equal(actualContext, context)
            result = response
        })
        assert.equal(result.status, 200)
        assert.equal(output.log.length, enabled ? 2 : 0)
        assert.equal(output.error.length, 0)
        if (enabled) {
            assert.match(output.log[0][0], /^\[S2S SEND app-one\]/)
            assert.match(output.log[1][0], /^\[S2S RECV app-one\]/)
        }
    })
}

test('callbacks are per context, redact outgoing secrets, and can be reset', () => {
    const { sdk, context, output, send } = createClient()
    const other = sdk.init('app-two', 'server', 'another-secret')
    const entries = []
    sdk.setLogEnabled(context, true)
    sdk.setLogEnabled(other, true)
    sdk.setLogCallback(context, (actualContext, entry) => {
        assert.equal(actualContext, context)
        entries.push(entry)
    })
    send()
    assert.equal(entries.length, 2)
    assert.ok(entries.every(entry => entry.level === 'debug'))
    assert.match(entries[0].message, /\[REDACTED\]/)
    assert.doesNotMatch(entries[0].message, /request-secret/)
    assert.equal(output.log.length, 0)
    send(undefined, other)
    assert.equal(entries.length, 2)
    assert.equal(output.log.length, 2)
    assert.match(output.log[0][0], /^\[S2S SEND app-two\]/)
    sdk.setLogCallback(context, null)
    send()
    assert.equal(entries.length, 2)
    assert.equal(output.log.length, 4)
})

for (const showSecrets of [false, true]) {
    test(`parse errors include response details with showSecretLogs = ${showSecrets}`, () => {
        const malformed = '{"token":"response-secret",BROKEN'
        const { sdk, context, send } = createClient(malformed)
        const entries = []
        sdk.setShowSecretLogs(context, showSecrets)
        sdk.setLogCallback(context, (_, entry) => entries.push(entry))
        let result = 'not called'
        send((_, response) => { result = response })
        assert.equal(result, null)
        assert.equal(entries.length, 1)
        assert.equal(entries[0].level, 'error')
        assert.equal(entries[0].error.name, 'SyntaxError')
        assert.match(entries[0].message, /^\[S2S Error parsing response data app-one\]/)
        assert.equal(entries[0].responseBody,
            showSecrets ? malformed : '{"token":"[REDACTED]",BROKEN')
    })
}

test('request callback errors are logged when verbose logging is disabled', () => {
    const { sdk, context, send } = createClient()
    const error = new Error('consumer failed')
    const entries = []
    sdk.setLogCallback(context, (_, entry) => entries.push(entry))
    send(() => { throw error })
    assert.equal(entries.length, 1)
    assert.equal(entries[0].level, 'error')
    assert.equal(entries[0].error, error)
    assert.match(entries[0].message, /^\[S2S Callback Error app-one\]/)
    assert.equal(context.requestQueue.length, 0)
})

test('a throwing logger falls back to console and does not interrupt requests', () => {
    const { sdk, context, output, send } = createClient()
    const error = new Error('logger failed')
    sdk.setLogEnabled(context, true)
    sdk.setLogCallback(context, () => { throw error })
    let result
    send((_, response) => { result = response })
    assert.equal(result.status, 200)
    assert.equal(context.requestQueue.length, 0)
    assert.equal(output.log.length, 2)
    assert.equal(output.error.length, 2)
    assert.ok(output.error.every(args => args[1] === error))
})

for (const enabled of [false, true]) {
    test(`transport errors retain verbose logging = ${enabled}`, () => {
        const error = new Error('connection refused')
        const { sdk, context, send } = createClient(undefined, error)
        const entries = []
        sdk.setLogEnabled(context, enabled)
        sdk.setLogCallback(context, (_, entry) => entries.push(entry))
        let result = 'not called'
        send((_, response) => { result = response })
        assert.equal(result, null)
        assert.equal(entries.length, enabled ? 2 : 0)
        if (enabled) {
            assert.equal(entries[1].level, 'error')
            assert.equal(entries[1].error, error)
            assert.match(entries[1].message, /^\[S2S Error making request app-one\]/)
        }
    })
}

test('heartbeat diagnostics use the callback and respect verbose logging', () => {
    const { sdk, context, tick } = createClient()
    const entries = []
    sdk.setLogCallback(context, (_, entry) => entries.push(entry))
    sdk.authenticate(context)
    assert.equal(entries.length, 0)
    sdk.setLogEnabled(context, true)
    tick()
    assert.equal(entries[0].message, 'Heartbeat')
    assert.equal(entries[0].level, 'debug')
    assert.equal(entries.length, 3)
    sdk.setLogEnabled(context, false)
    tick()
    assert.equal(entries.length, 3)
    sdk.disconnect(context)
})

test('invalid callbacks are rejected without replacing the existing callback', () => {
    const { sdk, context } = createClient()
    const callback = () => {}
    sdk.setLogCallback(context, callback)
    assert.throws(() => sdk.setLogCallback(context, 'invalid'), { name: 'TypeError' })
    assert.equal(context.logCallback, callback)
})
