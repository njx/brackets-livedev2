/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
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
/*global define, $, brackets */

/**
 * LiveHTMLDocument manages a single HTML source document
 */
define(function (require, exports, module) {
    "use strict";

    var DocumentManager     = brackets.getModule("document/DocumentManager"),
        PerfUtils           = brackets.getModule("utils/PerfUtils"),
        StringUtils         = brackets.getModule("utils/StringUtils"),
        _                   = brackets.getModule("thirdparty/lodash"),
        LiveDocument        = require("documents/LiveDocument"),
        HTMLInstrumentation = require("language/HTMLInstrumentation");

    /**
     * Constructor
     * @param {!DocumentManager.Document} doc the source document from Brackets
     * @param {editor=} editor
     */
    function LiveHTMLDocument(protocol, urlResolver, doc, editor) {
        LiveDocument.apply(this, arguments);
        
        this._instrumentationEnabled = false;
        
        this._onChange = this._onChange.bind(this);
        $(this.doc).on("change", this._onChange);
    }
    
    LiveHTMLDocument.prototype = Object.create(LiveDocument.prototype);
    LiveHTMLDocument.prototype.constructor = LiveHTMLDocument;
    LiveHTMLDocument.prototype.parentClass = LiveDocument.prototype;
    
    LiveHTMLDocument.prototype._onConnect = function (event, clientId, url) {
        var self = this;
        
        this.parentClass._onConnect.apply(this, arguments);
        
        if (url === this.urlResolver(this.doc.file.fullPath)) {
            // TODO: possible race condition if someone tries to access RemoteFunctions before this
            // injection is completed
            brackets.getModule(["text!LiveDevelopment/Agents/RemoteFunctions.js"], function (RemoteFunctions) {
                // Inject our remote functions into the browser.
                var command = "window._LD=" + RemoteFunctions + "();";
                // TODO: handle error, wasThrown?
                self.protocol.evaluate([clientId], command);
            });
        }
        
        // TODO: race condition if the version of the instrumented HTML that the browser loaded is out of sync with
        // our current state. Should include a serial number in the instrumented HTML representing the last live edit.
    };
    
    /**
     * Enable instrumented HTML
     * @param enabled {boolean} 
     */
    LiveHTMLDocument.prototype.setInstrumentationEnabled = function setInstrumentationEnabled(enabled) {
        if (!this.editor) {
            // TODO: error
            return;
        }
        if (enabled && !this._instrumentationEnabled) {
            HTMLInstrumentation.scanDocument(this.doc);
            HTMLInstrumentation._markText(this.editor);
        }
        
        this._instrumentationEnabled = enabled;
    };
    
    /**
     * Returns true if document edits appear live in the connected browser
     * @return {boolean} 
     */
    LiveHTMLDocument.prototype.isLiveEditingEnabled = function () {
        return this._instrumentationEnabled;
    };
    
    /**
     * Returns a JSON object with HTTP response overrides
     * @return {{body: string}}
     */
    LiveHTMLDocument.prototype.getResponseData = function getResponseData(enabled) {
        var body;
        if (this._instrumentationEnabled) {
            body = HTMLInstrumentation.generateInstrumentedHTML(this.editor, this.protocol.getInjectScript());
        }
        
        return {
            body: body || this.doc.getText()
        };
    };

    /** Close the document */
    LiveHTMLDocument.prototype.close = function close() {
        $(this.doc).off("change", this._onChange);
        this.parentClass.close.call(this);
    };
    
    /** Update the highlight */
    LiveHTMLDocument.prototype.updateHighlight = function () {
        if (!this.editor) {
            return;
        }
        var editor = this.editor,
            codeMirror = editor._codeMirror,
            ids = [];
        // TODO: only if highlighting enabled
        //if (Inspector.config.highlight) {
        _.each(this.editor.getSelections(), function (sel) {
            var tagID = HTMLInstrumentation._getTagIDAtDocumentPos(
                editor,
                sel.reversed ? sel.end : sel.start
            );
            if (tagID !== -1) {
                ids.push(tagID);
            }
        });

        if (!ids.length) {
            this.hideHighlight();
        } else {
            this.highlightDomElement(ids);
        }
        //}
    };

    /** Triggered on cursor activity by the editor */
    LiveHTMLDocument.prototype._onCursorActivity = function (event, editor) {
        if (!this.editor) {
            return;
        }
        this.updateHighlight();
    };
    
    /**
     * @private
     * For the given editor change, compare the resulting browser DOM with the
     * in-editor DOM. If there are any diffs, a warning is logged to the
     * console along with each diff.
     * @param {Object} change CodeMirror editor change data
     */
    LiveHTMLDocument.prototype._compareWithBrowser = function (change) {
        var self = this;
        
        // TODO: evaluate in browser
//        RemoteAgent.call("getSimpleDOM").done(function (res) {
//            var browserSimpleDOM = JSON.parse(res.result.value),
//                edits,
//                node,
//                result;
//            
//            try {
//                result = HTMLInstrumentation._getBrowserDiff(self.editor, browserSimpleDOM);
//            } catch (err) {
//                console.error("Error comparing in-browser DOM to in-editor DOM");
//                console.error(err.stack);
//                return;
//            }
//            
//            edits = result.diff.filter(function (delta) {
//                // ignore textDelete in html root element
//                node = result.browser.nodeMap[delta.parentID];
//                
//                if (node && node.tag === "html" && delta.type === "textDelete") {
//                    return false;
//                }
//                
//                return true;
//            });
//            
//            if (edits.length > 0) {
//                console.warn("Browser DOM does not match after change: " + JSON.stringify(change));
//                
//                edits.forEach(function (delta) {
//                    console.log(delta);
//                });
//            }
//        });
    };

    /** Triggered on change by the editor */
    LiveHTMLDocument.prototype._onChange = function (event, doc, change) {
        // Make sure LiveHTML is turned on
        if (!this._instrumentationEnabled) {
            return;
        }

        // Apply DOM edits is async, so previous PerfUtils timer may still be
        // running. PerfUtils does not support running multiple timers with same
        // name, so do not start another timer in this case.
        var perfTimerName   = "LiveHTMLDocument applyDOMEdits",
            isNestedTimer   = PerfUtils.isActive(perfTimerName);
        if (!isNestedTimer) {
            PerfUtils.markStart(perfTimerName);
        }

        var self                = this,
            result              = HTMLInstrumentation.getUnappliedEditList(this.editor, change),
            applyEditsPromise;
        
        if (result.edits) {
            // TODO: eval in browser
            applyEditsPromise = this.protocol.evaluate(this.getConnectionIds(), "_LD.applyDOMEdits(" + JSON.stringify(result.edits) + ")");
    
            applyEditsPromise.always(function () {
                if (!isNestedTimer) {
                    PerfUtils.addMeasurement(perfTimerName);
                }
            });
        }

        this.errors = result.errors || [];
        this._updateErrorDisplay();
        
        // Debug-only: compare in-memory vs. in-browser DOM
        // edit this file or set a conditional breakpoint at the top of this function:
        //     "this._debug = true, false"
        if (this._debug) {
            console.log("Edits applied to browser were:");
            console.log(JSON.stringify(result.edits, null, 2));
            applyEditsPromise.done(function () {
                self._compareWithBrowser(change);
            });
        }
    };

    // Export the class
    module.exports = LiveHTMLDocument;
});