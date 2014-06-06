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

/*jslint browser: true, vars: true, plusplus: true, devel: true, nomen: true, indent: 4, forin: true, maxerr: 50, regexp: true, evil: true */

// This is the script that Brackets live development injects into HTML pages in order to
// establish and maintain the live development socket connection. Note that Brackets may
// also inject other scripts via "evaluate" once this has connected back to Brackets.

(function (global) {
    "use strict";
    
    // This protocol handler assumes that there is also an injected transport script that
    // has the following methods:
    //     setCallbacks(obj) - a method that takes an object with a "message" callback that
    //         will be called with the message string whenever a message is received by the transport.
    //     send(msgStr) - sends the given message string over the transport.
    var transport = global._Brackets_LiveDev_Transport;
    
    // Queue for pending messages that could be eventually sent before transport is connected. 
    var _msgQueue = [];
    
    /*
    / Consumes messages in the queue and send them trough the current transport.
    */
    function _processMsgQueue() {
        while (_msgQueue.length > 0) {
            transport.send(JSON.stringify(_msgQueue.shift()));
        }
    }

    /*
    / Enqueue a message and process the queue if transport is available.
    */
    function _send(msg) {
        _msgQueue.push(msg);
        if (transport) {
            _processMsgQueue();
        }
    }
    
    // Initial migration of monitoring to MutationObserver interface
    // TODO: We should probably have a better extensible way of adding -sensors- to the remote document.
    function _onNodesChanged(nodes, action) {
        var i;
        for (i = 0; i < nodes.length; i++) {
            //check for Javascript files
            if (nodes[i].nodeName === "SCRIPT" && nodes[i].src) {
                _send({type: 'Script.' + action, src: nodes[i].src});
            }
            //check for stylesheets
            if (nodes[i].nodeName === "LINK" && nodes[i].rel === "stylesheet" && nodes[i].href) {
                _send({type: 'Stylesheet.' + action, href: nodes[i].href});
                // TODO: check for @import rules. 
                // It seems that node we get from MutationRecord doesn't have the entire information, 
                // probably because of the time when the event is being triggered: 
                //  - Added stylesheet has import rules (wich give us relative URL) but, 
                //    the stylesheet to be imported is not yet loaded (sheet=null).
                //  - Removed stylesheet also has sheet=null since it was proabably already removed.
                // Need to invastigate deeper on MutationObserver or eventually mantain a simple 
                // representation of CSS dependencies by querying DOM after the sheet is loaded 
                // and iterate on depedencies when the parent node is being removed.
            }
        }
    }
    
    var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
    if (MutationObserver) {
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.addedNodes.length > 0) {
                    _onNodesChanged(mutation.addedNodes, 'Added');
                }
                if (mutation.removedNodes.length > 0) {
                    _onNodesChanged(mutation.removedNodes, 'Removed');
                }
            });
        });
        observer.observe(document, {
            childList: true,
            subtree: true
        });

    } else {
        //use MutationEvents as fallback
        document.addEventListener('DOMNodeInserted', function (e) {
            _onNodesChanged([e.target], 'Added');
        });
        document.addEventListener('DOMNodeRemoved', function (e) {
            _onNodesChanged([e.target], 'Removed');
        });
    }
    
    /**
     * The remote handler for the protocol.
     */
    var ProtocolHandler = {
        /**
         * Handles a message from the transport. Parses it as JSON and looks at the
         * "method" field to determine what the action is.
         * @param {msgStr} string The protocol message as stringified JSON.
         */
        message: function (msgStr) {
            console.log("received: " + msgStr);
            var msg = JSON.parse(msgStr);
            
            // TODO: more easily extensible way of adding protocol handler methods
            if (msg.method === "Runtime.evaluate") {
                console.log("evaluating: " + msg.params.expression);
                var result = eval(msg.params.expression);
                console.log("result: " + result);
                this.respond(msg, {
                    result: JSON.stringify(result) // TODO: in original protocol this is an object handle
                });
            }
            //Mechanism for extending protocol should probably change first.
            if (msg.method === "Document.getRelated") {
                console.log("Document.getRelated");
                var related = {scripts: {}, stylesheets: {}};
                var i;
                //iterate on document scripts (HTMLCollection doesn't provide forEach iterator).
                for (i = 0; i < document.scripts.length; i++) {
                    //add only external scripts
                    if (document.scripts[i].src) {
                        related.scripts[document.scripts[i].src] = true;
                    }
                }
                var s, j;
                //traverse @import rules
                var traverseRules = function _traverseRules(sheet, base) {
                    var i;
                    if (sheet.href && sheet.cssRules) {
                        if (related.stylesheets[sheet.href] === undefined) {
                            related.stylesheets[sheet.href] = [];
                        }
                        related.stylesheets[sheet.href].push(base);
                        //console.log("rule in: " + sheet.href + ", base: " + base);
                        for (i = 0; i < sheet.cssRules.length; i++) {
                            if (sheet.cssRules[i].href) {
                                traverseRules(sheet.cssRules[i].styleSheet, base);
                            }
                        }
                    }
                };
                //iterate on document.stylesheets (StyleSheetList doesn't provide forEach iterator).
                for (j = 0; j < document.styleSheets.length; j++) {
                    s = document.styleSheets[j];
                    traverseRules(s, s.href);
                }
                this.respond(msg, {
                    related: JSON.stringify(related)
                });
            }
        },
        
        /**
         * Responds to a message, setting the response message's ID to the same ID as the
         * original request.
         * @param {Object} orig The original message object.
         * @param {Object} response The response message object.
         */
        respond: function (orig, response) {
            response.id = orig.id;
            transport.send(JSON.stringify(response));
        },
        
        /**
         * Handler for transport connection.
         */
        connect: function () {
            _processMsgQueue();
        }
    };
    
    // By the time this executes, there must already be an active transport.
    if (!transport) {
        console.error("[Brackets LiveDev] No transport set");
        return;
    }
    
    transport.setCallbacks(ProtocolHandler);
}(this));
