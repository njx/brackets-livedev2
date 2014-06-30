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

function DocumentObserver(config) {
    
    "use strict";
    
    var _document = null;
    var _transport;
    var _imports = {};
    
    /**
     * Send an event in case that a related doc was added/removed 
     * 
     * @param {NodeList} nodes DOM nodes that were modified
     * @param {string} action "Added" or "Removed"
     */
    function _onNodesChanged(nodes, action) {
        var i;
        for (i = 0; i < nodes.length; i++) {
            // check for Javascript files
            if (nodes[i].nodeName === "SCRIPT" && nodes[i].src) {
                _transport.send(JSON.stringify({
                    method: 'Script.' + action,
                    src: nodes[i].src
                }));
            }
            
            // check for stylesheets
            if (nodes[i].nodeName === "LINK" && nodes[i].rel === "stylesheet" && nodes[i].href) {
                _transport.send(JSON.stringify({
                    method: 'Stylesheet.' + action,
                    href: nodes[i].href
                }));
                // TODO: check for @import rules. 
                // It seems that node we get from MutationRecord doesn't have the entire information:
                //  - Added stylesheet has import rules (wich give us relative URL) but in Chrome, 
                //    the stylesheet to be imported is not yet loaded (sheet=null). 
                //  - Removed stylesheet also has sheet=null since it was proabably already removed.
            }
        }
    }

    function _enableListeners() {
        // enable MutationOberver if it's supported
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
            observer.observe(_document, {
                childList: true,
                subtree: true
            });
        } else {
            // use MutationEvents as fallback 
            _document.addEventListener('DOMNodeInserted', function niLstnr(e) {
                this._onNodesChanged([e.target], 'Added');
            });
            _document.addEventListener('DOMNodeRemoved', function nrLstnr(e) {
                this._onNodesChanged([e.target], 'Removed');
            });
        }
    }
    
    /**
     * Retrieves related documents (external CSS and JS files)
     * 
     * @return {{scripts: object, stylesheets: object}} Related scripts and stylesheets
     */
    function related() {

        var rel = {
            scripts: {},
            stylesheets: {}
        };
        var i;
        // iterate on document scripts (HTMLCollection doesn't provide forEach iterator).
        for (i = 0; i < _document.scripts.length; i++) {
            // add only external scripts
            if (_document.scripts[i].src) {
                rel.scripts[_document.scripts[i].src] = true;
            }
        }
          
        var s, j;
        //traverse @import rules
        var traverseRules = function _traverseRules(sheet, base) {
            var i;
            if (sheet.href && sheet.cssRules) {
                if (rel.stylesheets[sheet.href] === undefined) {
                    rel.stylesheets[sheet.href] = [];
                }
                rel.stylesheets[sheet.href].push(base);
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
        return rel;
    }
    
    /**
     * Start listening for events and send initial related documents message.
     * 
     * @param {HTMLDocument} document
     * @param {object} transport Live development transport connection
     */
    function start(document, transport) {
        _transport = transport;
        _document = document;
        // start listening to node changes
        _enableListeners();
        // send the current status of related docs. 
        _transport.send(JSON.stringify({
            method: "Document.Related",
            related: related()
        }));
    }
    
    /**
     * Stop listening.
     * TODO currently a no-op.
     */
    function stop() {
    
    }
    
    window.addEventListener('load', function () {
        //it assumes transport is already set into the browser
        start(window.document, window._Brackets_LiveDev_Transport);
    });
    
    window.addEventListener('unload', function () {
        stop();
    });

    return {
        start: start,
        stop: stop,
        related: related
    };
}