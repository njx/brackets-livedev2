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

define(function (require, exports, module) {
    "use strict";
    
    var RemoteProtocolHandler = require("text!inject/RemoteProtocolHandler.js");
    
    var _transport = null,
        _nextMsgId = 1,
        _responseDeferreds = {};
    
    function _receive(clientId, msg) {
        var deferred, msgStr;
        if (msg.id) {
            deferred = _responseDeferreds[msg.id];
            if (deferred) {
                delete _responseDeferreds[msg.id];
                msgStr = JSON.stringify(msg);
                if (msg.error) {
                    deferred.reject(msgStr);
                } else {
                    deferred.resolve(msgStr);
                }
            }
        } else {
            $(exports).triggerHandler("event", [clientId, msg]);
        }
    }
    
    function _send(clients, msg) {
        var id = _nextMsgId++,
            result = new $.Deferred();
        msg.id = id;
        _responseDeferreds[id] = result;
        _transport.send(clients, JSON.stringify(msg));
        return result.promise();
    }
    
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
    
    function getInjectScript() {
        var transportScript = _transport.getInjectScript();
        return transportScript +
            "<script>\n" + RemoteProtocolHandler + "</script>\n";
    }
    
    function launch(url) {
        _transport.launch(url);
    }
    
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
    
    exports.setTransport = setTransport;
    exports.getInjectScript = getInjectScript;
    exports.launch = launch;
    exports.evaluate = evaluate;
});
