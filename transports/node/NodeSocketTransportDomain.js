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

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, node: true */
/*global */

(function () {
    "use strict";
    
    var WebSocketServer = require("ws").Server,
        open = require("open"),
        _ = require("lodash");
    
    var _wsServer,
        _domainManager,
        _nextClientId = 1,
        _clients = {};
    
    // This must match the port declared in NodeSocketTransport.js.
    // TODO: randomize this?
    var SOCKET_PORT = 8123;

    function _clientForSocket(ws) {
        return _.find(_clients, function (client) {
            return (client.socket === ws);
        });
    }
    
    function _createServer() {
        if (!_wsServer) {
            // TODO: make port configurable, or use random port
            _wsServer = new WebSocketServer({port: SOCKET_PORT});
            _wsServer.on("connection", function (ws) {
                ws.on("message", function (msg) {
                    console.log("WebSocketServer - received - " + msg);
                    var msgObj;
                    try {
                        msgObj = JSON.parse(msg);
                    } catch (e) {
                        console.error("nodeSocketTransport: Error parsing message: " + msg);
                        return;
                    }
                    if (msgObj.type === "connect") {
                        if (!msgObj.url) {
                            console.error("nodeSocketTransport: Malformed connect message: " + msg);
                            return;
                        }
                        var clientId = _nextClientId++;
                        _clients[clientId] = {
                            id: clientId,
                            url: msgObj.url,
                            socket: ws
                        };
                        console.log("emitting connect event");
                        _domainManager.emitEvent("nodeSocketTransport", "connect", [clientId, msgObj.url]);
                    } else if (msgObj.type === "message") {
                        var client = _clientForSocket(ws);
                        if (client) {
                            _domainManager.emitEvent("nodeSocketTransport", "message", [client.id, msgObj.message]);
                        } else {
                            console.error("nodeSocketTransport: Couldn't locate client for message: " + msg);
                        }
                    } else {
                        console.error("nodeSocketTransport: Got bad socket message type: " + msg);
                    }
                }).on("error", function (e) {
                    // TODO: emit error event
                    var client = _clientForSocket(ws);
                    console.error("nodeSocketTransport: Error on socket for client " + JSON.stringify(client) + ": " + e);
                }).on("close", function () {
                    var client = _clientForSocket(ws);
                    if (client) {
                        _domainManager.emitEvent("nodeSocketTransport", "close", [client.id]);
                        delete _clients[client.id];
                    } else {
                        console.error("nodeSocketTransport: Socket closed, but couldn't locate client");
                    }
                });
            });
        }
    }
    
    function _cmdLaunch(url) {
        _createServer();
        open(url);
    }
    
    function _cmdSend(idOrArray, msg) {
        if (!Array.isArray(idOrArray)) {
            idOrArray = [idOrArray];
        }
        idOrArray.forEach(function (id) {
            var client = _clients[id];
            if (!client) {
                console.error("nodeSocketTransport: Couldn't find client ID: " + id);
            } else {
                client.socket.send(msg);
            }
        });
    }
    
    function _cmdClose(id) {
        var client = _clients[id];
        if (client) {
            client.socket.close();
            delete _clients[id];
        }
    }
    
    /**
     * Initializes the domain and registers commands.
     * @param {DomainManager} domainManager The DomainManager for the server
     */
    function init(domainManager) {
        _domainManager = domainManager;
        if (!domainManager.hasDomain("nodeSocketTransport")) {
            domainManager.registerDomain("nodeSocketTransport", {major: 0, minor: 1});
        }
        domainManager.registerCommand(
            "nodeSocketTransport",      // domain name
            "launch",       // command name
            _cmdLaunch,     // command handler function
            false,          // this command is synchronous in Node
            "Launches a given HTML file in the browser for live development",
            [{name: "url", // parameters
                type: "string",
                description: "file:// url to the HTML file"}],
            []
        );
        domainManager.registerCommand(
            "nodeSocketTransport",      // domain name
            "send",         // command name
            _cmdSend,       // command handler function
            false,          // this command is synchronous in Node
            "Sends a message to a given client or list of clients",
            [
                {name: "idOrArray", type: "number|Array.<number>", description: "id or array of ids to send the message to"},
                {name: "message", type: "string", description: "JSON message to send"}
            ],
            []
        );
        domainManager.registerCommand(
            "nodeSocketTransport",      // domain name
            "close",         // command name
            _cmdClose,       // command handler function
            false,          // this command is synchronous in Node
            "Closes the connection to a given client",
            [
                {name: "id", type: "number", description: "id of connection to close"}
            ],
            []
        );
        domainManager.registerEvent(
            "nodeSocketTransport",
            "connect",
            [
                {name: "clientID", type: "number", description: "ID of live preview page connecting to live development"},
                {name: "url", type: "string", description: "URL of page that live preview is connecting from"}
            ]
        );
        domainManager.registerEvent(
            "nodeSocketTransport",
            "message",
            [
                {name: "clientID", type: "number", description: "ID of live preview page sending message"},
                {name: "msg", type: "string", description: "JSON message from client page"}
            ]
        );
        domainManager.registerEvent(
            "nodeSocketTransport",
            "close",
            [
                {name: "clientID", type: "number", description: "ID of live preview page being closed"}
            ]
        );
    }
    
    exports.init = init;
    
}());
