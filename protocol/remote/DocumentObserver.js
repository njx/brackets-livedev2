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


function DocumentObserver(config) {
    
    "use strict";
    
    var _document = null;
    var _transport;
    var _imports = {};
    
    /* send an event in case that a related doc was added/removed */
    function _onNodesChanged(nodes, action) {
        var i;
        for (i = 0; i < nodes.length; i++) {
            //check for Javascript files
            if (nodes[i].nodeName === "SCRIPT" && nodes[i].src) {
                _transport.send(JSON.stringify({
                    type: 'Script.' + action,
                    src: nodes[i].src
                }));
            }
            //check for stylesheets
            if (nodes[i].nodeName === "LINK" && nodes[i].rel === "stylesheet" && nodes[i].href) {
                _transport.send(JSON.stringify({
                    type: 'Stylesheet.' + action,
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
    
            /* 
    * Extract styleSheets included in CSSImportRules.
    * @param {Object} stylesheet
    * @return {Array} hrefs of import-ed StyleSheets
    * TODO: check for nested @imports  
    */
    function _scanImports(styleSheet) {
        var i,
            imports = [];
        for (i = 0; i < styleSheet.cssRules.length; i++) {
            if (styleSheet.cssRules[i].href) {
                imports.push(styleSheet.cssRules[i].styleSheet.href);
            }
        }
        return imports;
    }
    
    /*  Retrieves related documents (external CSS and JS files) */
    function related() {

        var rel = {
            scripts: {},
            stylesheets: {}
        };
        var i;
        //iterate on document scripts (HTMLCollection doesn't provide forEach iterator).
        for (i = 0; i < _document.scripts.length; i++) {
            //add only external scripts
            if (_document.scripts[i].src) {
                rel.scripts[_document.scripts[i].src] = true;
            }
        }
          
        //iterate on document.stylesheets (StyleSheetList doesn't provide forEach iterator).
        for (i = 0; i < _document.styleSheets.length; i++) {
            var s = _document.styleSheets[i];
            if (s.href) {
                rel.stylesheets[s.href] = true;
            }
            //extract @imports.
            var imports = _scanImports(s);
            
            for (i = 0; i < imports.length; i++) {
                // add @imports to related 
                rel.stylesheets[imports[i]] = true;
                // add @imports to this._imports 
                // need to keep them for notifying changes.
                if (!_imports[s.href]) {
                    _imports[s.href] = [];
                }
                _imports[s.href].push(imports[i]);
            }
        }
        return rel;
    }
    
    function start(document, transport) {
        _transport = transport;
        _document = document;
        //start listening to node changes
        _enableListeners();
        //send the current status of related docs. 
        _transport.send(JSON.stringify({
            type: "Document.Related",
            related: related()
        }));
    }
    
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