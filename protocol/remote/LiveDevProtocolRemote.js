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
    
    
    // Adding some initial implementation for monitoring changes in related documents 
    // TODO: It works on Chrome35 and IE10 but not in Firefox29 (already deprecated?)
    // Migrate this implementation to MutationObserver interface and use this based on
    // MutationEvents as a fallback for browsers that still not support it.
    // TODO: We should probably have a better extensible way of adding -sensors- to the remote document.
    // TODO: Should we have an 'abstract' protocol and some particular implementations for browser specifics?
    function _onNodeInserted(evt) {
        if (evt.target.tagName === "SCRIPT" && evt.target.src) {
            transport.send(JSON.stringify({type: 'Script.Added', src: evt.target.src}));
        }
        if (evt.target.tagName === "LINK" && evt.target.rel === "stylesheet" && evt.target.href) {
            transport.send(JSON.stringify({type: 'Stylesheet.Added', href: evt.target.href}));
        }
    }
                
    function _onNodeRemoved(evt) {
        if (evt.target.tagName === "SCRIPT" && evt.target.src) {
            transport.send(JSON.stringify({type: 'Script.Removed', src: evt.target.src}));
        }
        if (evt.target.tagName === "LINK" && evt.target.rel === "stylesheet" && evt.target.href) {
            transport.send(JSON.stringify({type: 'Stylesheet.Removed', href: evt.target.href}));
        }
    }
                
    document.addEventListener('DOMNodeInserted', _onNodeInserted);
    document.addEventListener('DOMNodeRemoved', _onNodeRemoved);
    
    
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
            //TODO: Decouple stylesheets from scripts and provide events to track changes (added/removed). 
            //Mechanism for extending protocol should probably change first.
            if (msg.method === "Document.getRelated") {
                console.log("Document.getRelated");
                var related = {scripts: {}, stylesheets: {}};
                
                //iterate on document scripts (HTMLCollection doesn't provide forEach iterator).
                for (var i=0; i < document.scripts.length ; i++){
                    //add only external scripts
                    if (document.scripts[i].src) { 
                        related.scripts[document.scripts[i].src] = true; 
                    }
                }
                //iterate on document.stylesheets (StyleSheetList doesn't provide forEach iterator).
                for (var j=0; j < document.styleSheets.length ; j++){
                    var s = document.styleSheets[j];
                    if (s.href) { 
                        related.stylesheets[s.href] = true; 
                    }
                    //check for @import rules
                    var rules = s.cssRules;
                    for (var k=0; k < rules.length; k++){
                        if (rules[k].href) {
                            related.stylesheets[rules[k].styleSheet.href] = true;
                        }
                    }
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
        }
    };
    
    // By the time this executes, there must already be an active transport.
    if (!transport) {
        console.error("[Brackets LiveDev] No transport set");
        return;
    }
    
    transport.setCallbacks(ProtocolHandler);
}(this));
