/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, forin: true, maxerr: 50, regexp: true */
/*global define, $, brackets, window, open */

/**
 * Provides the protocol that Brackets uses to talk to a browser instance for live development.
 * Protocol methods are converted to a JSON message format, which is then sent over a provided
 * low-level transport and interpreted in the browser. For messages that expect a response, the
 * response is returned through a promise as an object.
 *
 * Events raised by the remote browser are dispatched as jQuery "event" events, with the first
 * parameter being the client ID of the remote browser, and the second parameter being the 
 * message object.
 *
 * Also proxies through the "launch" and "close" methods and the "connect" and "close" events
 * to/from the underlying transport.
 */

define(function (require, exports, module) {
    "use strict";
    
    // Text of the script we'll inject into the browser that handles protocol requests.
    var LiveDevProtocolRemote = require("text!protocol/remote/LiveDevProtocolRemote.js");
    
    /**
     * @private
     * The low-level transport we're communicating over, set by `setTransport()`.
     * @type {{launch: function(string), send: function(number|Array.<number>, string), close: function(number), getRemoteScript: function(): ?string}}
     */
    var _transport = null;
    
    /**
     * @private
     * A unique message serial number, used to match up responses with request messages.
     * @type {number}
     */
    var _nextMsgId = 1;
    
    /**
     * @private
     * A map of response IDs to deferreds, for messages that are awaiting responses.
     * @type {Object}
     */
    var _responseDeferreds = {};
    
    /**
     * @private
     * Handles a message received from the remote protocol handler via the transport.
     * If the message has an `id` field, it's assumed to be a response to a previous
     * request, and will be passed along to the original promise returned by `_send()`.
     * Otherwise, it's treated as an event and dispatched.
     *
     * @param {number} clientId ID of the client that sent the message
     * @param {string} msg The message that was sent, in JSON string format
     */
    function _receive(clientId, msgStr) {
        var msg = JSON.parse(msgStr),
            deferred;
        if (msg.id) {
            deferred = _responseDeferreds[msg.id];
            if (deferred) {
                delete _responseDeferreds[msg.id];
                if (msg.error) {
                    deferred.reject(msg);
                } else {
                    deferred.resolve(msg);
                }
            }
        } else {
            $(exports).triggerHandler("event", [clientId, msg]);
        }
    }
    
    /**
     * @private
     * Dispatches a message to the remote protocol handler via the transport.
     *
     * @param {number|Array.<number>} idOrArray ID or IDs of the client(s) that should
     *     receive the message.
     * @param {Object} msg The message to send.
     * @return {$.Promise} A promise that's fulfilled when the response to the message is received.
     */
    function _send(clients, msg) {
        var id = _nextMsgId++,
            result = new $.Deferred();
        msg.id = id;
        _responseDeferreds[id] = result;
        _transport.send(clients, JSON.stringify(msg));
        return result.promise();
    }
    
    /**
     * Sets the transport that should be used by the protocol. See `LiveDevelopment.setTransport()`
     * for more detail on the transport.
     * @param {{launch: function(string), send: function(number|Array.<number>, string), close: function(number), getRemoteScript: function(): ?string}} transport
     */
    function setTransport(transport) {
        if (_transport) {
            $(_transport).off(".livedev");
        }
        _transport = transport;
        $(_transport)
            .on("connect.livedev", function (event, clientId, url) {
                $(exports).triggerHandler("connect", [clientId, url]);
            })
            .on("message.livedev", function (event, clientId, msg) {
                _receive(clientId, msg);
            })
            .on("close.livedev", function (event, clientId) {
                $(exports).triggerHandler("close", [clientId]);
            });
    }
    
    /**
     * Returns a script that should be injected into the HTML that's launched in the
     * browser in order to handle protocol requests. Includes the <script> tags.
     * This script will also include the script required by the transport, if any.
     * @return {string}
     */
    function getRemoteScript() {
        var transportScript = _transport.getRemoteScript() || "";
        return transportScript +
            "<script>\n" + LiveDevProtocolRemote + "</script>\n";
    }
    
    /**
     * Launches the given URL in the browser. Proxies to the transport.
     * @param {string} url
     */
    function launch(url) {
        _transport.launch(url);
    }
    
    /**
     * Protocol method. Evaluates the given script in the browser (in global context), and returns a promise
     * that will be fulfilled with the result of the script, if any.
     * @param {number|Array.<number>} clients A client ID or array of client IDs that should evaluate
     *      the script.
     * @param {string} script The script to evalute.
     * @return {$.Promise} A promise that's resolved with the return value from the first client that responds
     *      to the evaluation.
     * TODO: we should probably have a way of returning the results from all clients, not just the first?
     */
    function evaluate(clients, script) {
        return _send(
            clients,
            {
                method: "Runtime.evaluate",
                params: {
                    expression: script
                }
            }
        );
    }
    
    /**
     * Closes the connection to the given client. Proxies to the transport.
     * @param {number} clientId
     */
    function close(clientId) {
        _transport.close(clientId);
    }
    
    exports.setTransport = setTransport;
    exports.getRemoteScript = getRemoteScript;
    exports.launch = launch;
    exports.evaluate = evaluate;
    exports.close = close;
});
