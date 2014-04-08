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
    
    var ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
        NodeDomain = brackets.getModule("utils/NodeDomain"),
        NodeSocketTransportRemote = require("text!transports/remote/NodeSocketTransportRemote.js");

    var NodeSocketTransportDomain = new NodeDomain("nodeSocketTransport", ExtensionUtils.getModulePath(module, "node/NodeSocketTransportDomain"));
    
    // This must match the port declared in NodeSocketTransportDomain.js.
    // TODO: randomize this?
    var SOCKET_PORT = 8123;
    
    function getRemoteScript() {
        return "<script>\n" +
            NodeSocketTransportRemote +
            "this._Brackets_LiveDev_Socket_Transport_URL = 'ws://localhost:" + SOCKET_PORT + "';\n" +
            "</script>\n";
    }
    
    function _init() {
        ["connect", "message", "close"].forEach(function (type) {
            $(NodeSocketTransportDomain).on(type, function () {
                console.log("NodeSocketTransport - event - " + type + " - " + JSON.stringify(Array.prototype.slice.call(arguments, 1)));
                // Remove the event object from the argument list.
                $(exports).triggerHandler(type, Array.prototype.slice.call(arguments, 1));
            });
        });
    }
    
    _init();
    
    // Exports
    
    exports.getRemoteScript = getRemoteScript;
    
    // Proxy the node domain methods directly through, since they have exactly the same
    // signatures as the ones we're supposed to provide.
    ["launch", "send", "close"].forEach(function (method) {
        exports[method] = function () {
            var args = Array.prototype.slice.call(arguments);
            args.unshift(method);
            console.log("NodeSocketTransport - " + args);
            NodeSocketTransportDomain.exec.apply(NodeSocketTransportDomain, args);
        };
    });

});
