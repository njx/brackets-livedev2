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
 * LiveCSSDocument manages a single CSS source document
 *
 * # EDITING
 *
 * Editing the document will cause the style sheet to be reloaded via the
 * CSSAgent, which immediately updates the appearance of the rendered document.
 *
 * # HIGHLIGHTING
 *
 * LiveCSSDocument supports highlighting nodes from the HighlightAgent and
 * highlighting all DOMNode corresponding to the rule at the cursor position
 * in the editor.
 *
 * # EVENTS
 *
 * LiveCSSDocument dispatches these events:
 *  deleted - When the file for the underlying Document has been deleted. The
 *      2nd argument to the listener will be this LiveCSSDocument.
 */
define(function LiveCSSDocumentModule(require, exports, module) {
    "use strict";

    var _               = brackets.getModule("thirdparty/lodash"),
        CSSUtils        = brackets.getModule("language/CSSUtils"),
        EditorManager   = brackets.getModule("editor/EditorManager"),
        LiveDocument    = require("documents/LiveDocument");

    /** Constructor
     *
     * @param Document the source document from Brackets
     */
    var LiveCSSDocument = function LiveCSSDocument(protocol, urlResolver, doc, editor) {
        LiveDocument.apply(this, arguments);
        
        // Add a ref to the doc since we're listening for change events
        this.doc.addRef();
        this.onChange = this.onChange.bind(this);
        this.onDeleted = this.onDeleted.bind(this);

        $(this.doc).on("change.LiveCSSDocument", this.onChange);
        $(this.doc).on("deleted.LiveCSSDocument", this.onDeleted);
    };
    
    LiveCSSDocument.prototype = Object.create(LiveDocument.prototype);
    LiveCSSDocument.prototype.constructor = LiveCSSDocument;
    LiveCSSDocument.prototype.parentClass = LiveDocument.prototype;

    /**
     * @private
     * Get the CSSStyleSheetHeader for this document
     */
    LiveCSSDocument.prototype._getStyleSheetHeader = function () {
        // TODO
        //return CSSAgent.styleForURL(this.doc.url);
    };

    /**
     * @deprecated
     * CSSStyleSheetBody was removed in protocol 1.1. This method is unused in Brackets 36.
     * Get the browser version of the StyleSheet object
     * @return {jQuery.promise}
     */
    LiveCSSDocument.prototype.getStyleSheetFromBrowser = function getStyleSheetFromBrowser() {
        return new $.Deferred().reject().promise();
    };

    /**
     * Get the browser version of the source
     * @return {jQuery.promise} Promise resolved with the text content of this CSS document
     */
    LiveCSSDocument.prototype.getSourceFromBrowser = function getSourceFromBrowser() {
        // TODO: used for unit testing, need to be able to extract stylesheet from browser side
//        var deferred = new $.Deferred(),
//            styleSheetId = this._getStyleSheetHeader().styleSheetId,
//            inspectorPromise = Inspector.CSS.getStyleSheetText(styleSheetId);
//        
//        inspectorPromise.then(function (res) {
//            deferred.resolve(res.text);
//        }, deferred.reject);
//        
//        return deferred.promise();
    };
 
    /** Close the document */
    LiveCSSDocument.prototype.close = function close() {
        $(this.doc).off(".LiveCSSDocument");
        this.doc.releaseRef();
        this.parentClass.close.call(this);
    };

    /**
     * @private
     * Update the style sheet text content and redraw highlights
     */
    LiveCSSDocument.prototype._updateBrowser = function () {
        // TODO
        //var reloadPromise = CSSAgent.reloadCSSForDocument(this.doc);

        // TODO only if highlighting is on
        //if (Inspector.config.highlight) {
        //reloadPromise.done(HighlightAgent.redraw);
        //}
    };

    LiveCSSDocument.prototype.updateHighlight = function () {
        // TODO only if highlighting is on
        if (this.editor) {
            var editor = this.editor,
                codeMirror = editor._codeMirror,
                selectors = [];
            _.each(this.editor.getSelections(), function (sel) {
                var selector = CSSUtils.findSelectorAtDocumentPos(editor, (sel.reversed ? sel.end : sel.start));
                if (selector) {
                    selectors.push(selector);
                }
            });
            if (selectors.length) {
                this.highlightRule(selectors.join(","));
            } else {
                this.hideHighlight();
            }
        }
    };
    
    /**
     * Enable instrumented CSS
     * @param enabled {boolean} 
     */
    LiveCSSDocument.prototype.setInstrumentationEnabled = function setInstrumentationEnabled(enabled) {
        // no-op
        // "Instrumentation" is always enabled for CSS, we make no modifications
    };
    
    /**
     * Returns true if document edits appear live in the connected browser
     * @return {boolean} 
     */
    LiveCSSDocument.prototype.isLiveEditingEnabled = function () {
        return true;
    };
    
    /**
     * Returns a JSON object with HTTP response overrides
     * @returns {{body: string}}
     */
    LiveCSSDocument.prototype.getResponseData = function getResponseData(enabled) {
        return {
            body: this.doc.getText()
        };
    };

    /** Event Handlers *******************************************************/

    /** Triggered whenever the Document is edited */
    LiveCSSDocument.prototype.onChange = function onChange(event, editor, change) {
        this._updateBrowser();
    };

    /** Triggered if the Document's file is deleted */
    LiveCSSDocument.prototype.onDeleted = function onDeleted(event, editor, change) {
        // TODO
        // clear the CSS
        //CSSAgent.clearCSSForDocument(this.doc);

        // shut down, since our Document is now dead
        this.close();
        $(this).triggerHandler("deleted", [this]);
    };

    // Export the class
    module.exports = LiveCSSDocument;
});