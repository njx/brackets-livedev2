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
/*global define, $, brackets */

define(function (require, exports, module) {
    "use strict";
    
    var EditorManager   = brackets.getModule("editor/EditorManager"),
        _               = brackets.getModule("thirdparty/lodash");
        
    // Document errors
    var SYNC_ERROR_CLASS = "live-preview-sync-error";

    function LiveDocument(protocol, urlResolver, doc, editor) {
        this.protocol = protocol;
        this.urlResolver = urlResolver;
        this.doc = doc;
        this.connections = {};
        
        this._onConnect = this._onConnect.bind(this);
        this._onClose = this._onClose.bind(this);
        
        $(this.protocol)
            .on("connect", this._onConnect)
            .on("close", this._onClose);
        
        this._onActiveEditorChange = this._onActiveEditorChange.bind(this);
        this._onCursorActivity = this._onCursorActivity.bind(this);

        $(EditorManager).on("activeEditorChange", this._onActiveEditorChange);
        
        if (editor) {
            // Attach now
            this.attachToEditor(editor);
        }
    }
    
    LiveDocument.prototype.close = function () {
        this.getConnectionIds().forEach(function (clientId) {
            this.protocol.close(clientId);
        });
        this.connections = {};
        $(this.protocol)
            .off("connect", this._onConnect)
            .off("close", this._onClose);
        this._clearErrorDisplay();
        this.detachFromEditor();
        $(EditorManager).off("activeEditorChange", this._onActiveEditorChange);
    };
    
    LiveDocument.prototype.getConnectionIds = function () {
        return Object.keys(this.connections);
    };
    
    LiveDocument.prototype._onActiveEditorChange = function (event, newActive, oldActive) {
        this.detachFromEditor();
        
        if (newActive && newActive.document === this.doc) {
            this.attachToEditor(newActive);
        }
    };

    LiveDocument.prototype._onConnect = function (event, clientId, url) {
        if (url === this.urlResolver(this.doc.file.fullPath)) {
            this.connections[clientId] = true;
            $(this).triggerHandler("connect", [url]);
        }
    };
    
    LiveDocument.prototype._onClose = function (event, clientId) {
        // TODO: notify Live Development if this is the last connection so we can show disconnected
        delete this.connections[clientId];
    };
    
    LiveDocument.prototype.attachToEditor = function (editor) {
        this.editor = editor;
        
        if (this.editor) {
            $(this.editor).on("cursorActivity", this._onCursorActivity);
            this.updateHighlight();
        }
    };
    
    LiveDocument.prototype.detachFromEditor = function () {
        if (this.editor) {
            this.hideHighlight();
            $(this.editor).off("cursorActivity", this._onCursorActivity);
            this.editor = null;
        }
    };
    
//    function currentUrl() {
//        var doc = _getCurrentDocument();
//        if (!isActive() || !_server || !doc) {
//            return null;
//        }
//        return _server.pathToUrl(doc.file.fullPath);
//    }
//    
//    function _handleLiveDevConnect(event, id, url) {
//        if (url === currentUrl()) {
//            // Multiple clients can connect back to us for the same URL. Note that we're active
//            // as soon as the first one connects back.
//            _connections[id] = true;
//            _setStatus(STATUS_ACTIVE);
//        } else {
//            // Refuse the connection.
//            _protocol.close(id);
//        }
//    }
//    
//    function _handleLiveDevClose(event, id) {
//        _closeConnection(id);
//    }
    
    
    LiveDocument.prototype._onCursorActivity = function (event, editor) {
        if (!this.editor) {
            return;
        }
        this.updateHighlight();
    };
    
    /**
     * @private
     * Update errors shown by the live document in the editor.
     */
    LiveDocument.prototype._updateErrorDisplay = function () {
        var self = this,
            startLine,
            endLine,
            lineInfo,
            i,
            lineHandle;
        
        if (!this.editor) {
            return;
        }

        // Buffer addLineClass DOM changes in a CodeMirror operation
        this.editor._codeMirror.operation(function () {
            // Remove existing errors before marking new ones
            self._clearErrorDisplay();
            
            self._errorLineHandles = self._errorLineHandles || [];
    
            self.errors.forEach(function (error) {
                startLine = error.startPos.line;
                endLine = error.endPos.line;
                
                for (i = startLine; i < endLine + 1; i++) {
                    lineHandle = self.editor._codeMirror.addLineClass(i, "wrap", SYNC_ERROR_CLASS);
                    self._errorLineHandles.push(lineHandle);
                }
            });
        });
        
        $(this).triggerHandler("errorStatusChanged", [!!this.errors.length]);
    };
    
    LiveDocument.prototype._clearErrorDisplay = function () {
        var self = this,
            lineHandle;
        
        if (!this.editor ||
                !this._errorLineHandles ||
                !this._errorLineHandles.length) {
            return;
        }
        
        this.editor._codeMirror.operation(function () {
            while (true) {
                // Iterate over all lines that were previously marked with an error
                lineHandle = self._errorLineHandles.pop();
                
                if (!lineHandle) {
                    break;
                }
                
                self.editor._codeMirror.removeLineClass(lineHandle, "wrap", SYNC_ERROR_CLASS);
            }
        });
    };
    
    LiveDocument.prototype.updateHighlight = function () {
        // Does nothing in base class
    };
    
    LiveDocument.prototype.hideHighlight = function () {
        // TODO: eval hideHighlight in browser
//        RemoteAgent.call("hideHighlight");
    };

    /** Highlight all nodes affected by a CSS rule
     * @param {string} rule selector
     */
    LiveDocument.prototype.highlightRule = function (name) {
        if (this._lastHighlight === name) {
            return;
        }
        this._lastHighlight = name;
        this.hideHighlight();
        this.protocol.evaluate(this.getConnectionIds(), "_LD.highlightRule(" + JSON.stringify(name) + ")");
    };
    
    /** Highlight all nodes with 'data-brackets-id' value
     * that matches id, or if id is an array, matches any of the given ids.
     * @param {string|Array<string>} value of the 'data-brackets-id' to match,
     * or an array of such.
     */
    LiveDocument.prototype.highlightDomElement = function (ids) {
        var selector = "";
        if (!Array.isArray(ids)) {
            ids = [ids];
        }
        _.each(ids, function (id) {
            if (selector !== "") {
                selector += ",";
            }
            selector += "[data-brackets-id='" + id + "']";
        });
        this.highlightRule(selector);
    };
    
    /**
     * Redraw active highlights
     */
    LiveDocument.prototype.redraw = function () {
        this.protocol.evaluate(this.getConnectionIds(), "_LD.redrawHighlights()");
    };
    
    module.exports = LiveDocument;
});