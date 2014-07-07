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

    
    /**
     * Common functions.
     */
    var Utils = {
        
        isExternalStylesheet: function (node) {
            return (node.nodeName.toUpperCase() === "LINK" && node.rel === "stylesheet" && node.href);
        },
        isExternalScript: function (node) {
            return (node.nodeName.toUpperCase() === "SCRIPT" && node.src);
        }
    };
    
    /**
     * CSS related commands and notifications
     */
    var CSS = {
        
            /**
            * Maintains a map of stylesheets loaded thorugh @import rules and their parents.
            * Populated by extractImports, consumed by notifyImportsAdded / notifyImportsRemoved.
            * @type {
            */
            imports : {},
        
            /** 
             * Extract all the stylesheets for this parent by recursively
             * scanning CSSImportRules and push them to this.imports:
             *    imports[href] = [imp-href-1, imp-href-2, ...] urls of import-ed stylesheets, being href the url of the parent Stylesheet.
             * @param {Object:CSSStylesheet} stylesheet
             */
            extractImports : function (styleSheet) {
                var i,
                    parent,
                    rules = styleSheet.cssRules;
                if (!rules) {
                    return;
                }
                for (i = 0; i < rules.length; i++) {
                    if (rules[i].href) {
                        parent = rules[i].parentStyleSheet;
                        // initialize array 
                        if (!this.imports[parent.href]) {
                            this.imports[parent.href] = [];
                        }
                        // extract absolute url
                        this.imports[parent.href].push(rules[i].styleSheet.href);
                        // recursive
                        this.extractImports(rules[i].styleSheet);
                    }
                }
            },

            /**
             * Iterates on imports map and send a Stylesheet.Added notification per each 
             * import-ed stylesheet.
             * @param  {string} href Absolute URL of the stylesheet.
             */
            notifyImportsAdded : function (href) {
                var self = this;
                if (!this.imports[href]) {
                    return;
                }
                this.imports[href].forEach(function (impHref) {
                    _transport.send(JSON.stringify({
                        method: "Stylesheet.Added",
                        href: impHref,
                        parentStylesheet: href
                    }));
                    // recursive
                    self.notifyImportsAdded(impHref);
                });
            },

            /**
             * Sends a notification for the added stylesheet and drives the process 
             * that extracts @import rules and sends notifications for them.
             * @param  {string} href Absolute URL of the stylesheet.
             */
            notifyStylesheetAdded : function (href) {
                var self = this;
                // notify stylesheet added
                _transport.send(JSON.stringify({
                    method: "Stylesheet.Added",
                    href: href
                }));

                // Inspect CSSRules for @imports:
                // styleSheet obejct is required to scan CSSImportRules but
                // browsers differ on the implementation of MutationObserver interface.
                // Webkit triggers notifications before stylesheets are loaded, 
                // Firefox does it after loading.
                // There are also differences on when 'load' event is triggered for 
                // the 'link' nodes. Webkit triggers it before stylesheet is loaded.
                // Some references to check:
                //      http://www.phpied.com/when-is-a-stylesheet-really-loaded/
                //      http://stackoverflow.com/questions/17747616/webkit-dynamically-created-stylesheet-when-does-it-really-load
                //        http://stackoverflow.com/questions/11425209/are-dom-mutation-observers-slower-than-dom-mutation-events      
                //
                // TODO: This is just a temporary 'cross-browser' solution, it needs optimization.
                var loadInterval = setInterval(function () {
                    var i;
                    for (i = 0; i < document.styleSheets.length; i++) {
                        if (document.styleSheets[i].href === href) {
                            //clear interval
                            clearInterval(loadInterval);
                            //build imports map, extract imports to _imports[href]
                            self.extractImports(document.styleSheets[i]);
                            //notify imports
                            self.notifyImportsAdded(href);
                            break;
                        }
                    }
                }, 50);
            },

            /**
             * Iterates (recursively) on this.imports map and send a Stylesheet.Removed 
             * notification per each import-ed stylesheet taking href as the root parent.
             * @param  {string} href Absolute URL of the stylesheet.
             */
            notifyImportsRemoved : function (href) {
                var self = this;
                if (!this.imports[href]) {
                    return;
                }
                this.imports[href].forEach(function (impHref) {
                    _transport.send(JSON.stringify({
                        method: "Stylesheet.Removed",
                        href: impHref,
                        parentStylesheet: href
                    }));
                    // recursive
                    return self.notifyImportsRemoved(impHref);
                });
                // remove entry from imports
                delete this.imports[href];
            },
        
            /**
             * Sends a notification for the removed stylesheet and  
             * its import-ed styleshets.
             * @param  {string} href Absolute URL of the stylesheet.
             */
            notifyStylesheetRemoved : function (href) {
                var i;
                
                // notify stylesheet removed
                _transport.send(JSON.stringify({
                    method: "Stylesheet.Removed",
                    href: href
                }));
                this.notifyImportsRemoved(href);
            }
        };

    
    /* process related docs added */
    function _onNodesAdded(nodes) {
        var i;
        for (i = 0; i < nodes.length; i++) {
            //check for Javascript files
            if (Utils.isExternalScript(nodes[i])) {
                _transport.send(JSON.stringify({
                    method: 'Script.Added',
                    src: nodes[i].src
                }));
            }
            //check for stylesheets
            if (Utils.isExternalStylesheet(nodes[i])) {
                CSS.notifyStylesheetAdded(nodes[i].href);
            }
        }
    }
    /* process related docs removed */
    function _onNodesRemoved(nodes) {
        var i;
        //iterate on removed nodes
        for (i = 0; i < nodes.length; i++) {
            
            // check for external JS files
            if (Utils.isExternalScript(nodes[i])) {
                _transport.send(JSON.stringify({
                    method: 'Script.Removed',
                    src: nodes[i].src
                }));
            }
            //check for external StyleSheets
            if (Utils.isExternalStylesheet(nodes[i])) {
                CSS.notifyStylesheetRemoved(nodes[i].href);
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
                        _onNodesAdded(mutation.addedNodes);
                    }
                    if (mutation.removedNodes.length > 0) {
                        _onNodesRemoved(mutation.removedNodes);
                    }
                });
            });
            observer.observe(_document, {
                childList: true,
                subtree: true
            });
        } else {
            // use MutationEvents as fallback 
            document.addEventListener('DOMNodeInserted', function niLstnr(e) {
                _onNodesAdded([e.target]);
            });
            document.addEventListener('DOMNodeRemoved', function nrLstnr(e) {
                _onNodesRemoved([e.target]);
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
                
                // need to populate 'CSS.imports' to be able to track dependencies for notifications.
                // TODO: unify scan of import-ed stylesheets.
                if (!CSS.imports[base]) {
                    CSS.imports[base] = [];
                }
                // filtering parents since traverseRules also extract them.
                if (sheet.href !== base) {
                    CSS.imports[base].push(sheet.href);
                }
                
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