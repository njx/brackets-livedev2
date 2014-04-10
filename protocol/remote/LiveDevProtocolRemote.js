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
