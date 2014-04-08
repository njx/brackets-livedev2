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
/*global define, $, brackets, window, open */

/**
 * TODO: update this
 * LiveDevelopment manages the Inspector, all Agents, and the active LiveDocument
 *
 * # STARTING
 *
 * To start a session call `open`. This will read the currentDocument from brackets,
 * launch the LiveBrowser (currently Chrome) with the remote debugger port open,
 * establish the Inspector connection to the remote debugger, and finally load all
 * agents.
 *
 * # STOPPING
 *
 * To stop a session call `close`. This will close the active browser window,
 * disconnect the Inspector, unload all agents, and clean up.
 *
 * # STATUS
 *
 * Status updates are dispatched as `statusChange` jQuery events. The status
 * is passed as the first parameter and the reason for the change as the second
 * parameter. Currently only the "Inactive" status supports the reason parameter.
 * The status codes are:
 *
 * -1: Error
 *  0: Inactive
 *  1: Connecting to the remote debugger
 *  2: Loading agents
 *  3: Active
 *  4: Out of sync
 *
 * The reason codes are:
 * - null (Unknown reason)
 * - "explicit_close" (LiveDevelopment.close() was called)
 * - "navigated_away" (The browser changed to a location outside of the project)
 * - "detached_target_closed" (The tab or window was closed)
 * - "detached_replaced_with_devtools" (The developer tools were opened in the browser)
 */
define(function (require, exports, module) {
    "use strict";

    // Status Codes
    var STATUS_ERROR          = exports.STATUS_ERROR          = -1;
    var STATUS_INACTIVE       = exports.STATUS_INACTIVE       =  0;
    var STATUS_CONNECTING     = exports.STATUS_CONNECTING     =  1;
    var STATUS_LOADING_AGENTS = exports.STATUS_LOADING_AGENTS =  2;
    var STATUS_ACTIVE         = exports.STATUS_ACTIVE         =  3;
    var STATUS_OUT_OF_SYNC    = exports.STATUS_OUT_OF_SYNC    =  4;
    var STATUS_SYNC_ERROR     = exports.STATUS_SYNC_ERROR     =  5;

    var Async                = brackets.getModule("utils/Async"),
        Dialogs              = brackets.getModule("widgets/Dialogs"),
        DefaultDialogs       = brackets.getModule("widgets/DefaultDialogs"),
        DocumentManager      = brackets.getModule("document/DocumentManager"),
        EditorManager        = brackets.getModule("editor/EditorManager"),
        ExtensionUtils       = brackets.getModule("utils/ExtensionUtils"),
        FileSystemError      = brackets.getModule("filesystem/FileSystemError"),
        FileUtils            = brackets.getModule("file/FileUtils"),
        NativeApp            = brackets.getModule("utils/NativeApp"),
        PreferencesDialogs   = brackets.getModule("preferences/PreferencesDialogs"),
        ProjectManager       = brackets.getModule("project/ProjectManager"),
        Strings              = brackets.getModule("strings"),
        StringUtils          = brackets.getModule("utils/StringUtils"),
        NodeDomain           = brackets.getModule("utils/NodeDomain"),
        _                    = brackets.getModule("thirdparty/lodash"),
        LiveDevServerManager = brackets.getModule("LiveDevelopment/LiveDevServerManager"),
        NodeSocketTransport  = require("transports/NodeSocketTransport"),
        LiveDevProtocol      = require("LiveDevProtocol");
    
    // Documents
    var LiveCSSDocument     = require("documents/LiveCSSDocument"),
        LiveHTMLDocument    = require("documents/LiveHTMLDocument");
    
    /** @type {LiveHTMLDocument|LiveCSSDocument} */
    var _liveDocument;
    
    /** @type {Object.<string: {LiveHTMLDocument|LiveCSSDocument}>} */
    var _relatedDocuments = {};
    
    /**
     * Current transport for communicating with browser instances.
     * @type {{launch: function(string), send: function(number|Array.<number>, string), close: function(number)}}
     *     The transport to use with communicating with the browser. Must provide "launch", "send" and "close" methods,
     *     and trigger "connect", "message", and "close" events.
     */
    var _transport;
    
    /**
     * Protocol handler that provides the actual live development API on top of the current transport.
     */
    var _protocol = LiveDevProtocol;
    
    /**
     * Current live preview server
     * @type {BaseServer}
     */
    var _server;
    
    function _isHtmlFileExt(ext) {
        return (FileUtils.isStaticHtmlFileExt(ext) ||
                (ProjectManager.getBaseUrl() && FileUtils.isServerHtmlFileExt(ext)));
    }

    /** Get the current document from the document manager
     * _adds extension, url and root to the document
     */
    function _getCurrentDocument() {
        return DocumentManager.getCurrentDocument();
    }

    /** Determine which document class should be used for a given document
     * @param {Document} document
     */
    function _classForDocument(doc) {
        // TODO: this will require us to track stylesheets that are added and have support
        // in the browser for replacing them
//        if (doc.getLanguage().getId() === "css") {
//            return LiveCSSDocument;
//        }

        if (_isHtmlFileExt(doc.file.fullPath)) {
            return LiveHTMLDocument;
        }

        return null;
    }
    
    function isActive() {
        return exports.status > STATUS_INACTIVE;
    }

    function getLiveDocForPath(path) {
        if (!_server) {
            return undefined;
        }
        
        return _server.get(path);
    }
    
    function getLiveDocForEditor(editor) {
        if (!editor) {
            return null;
        }
        return getLiveDocForPath(editor.document.file.fullPath);
    }

    /**
     * @private
     * Close a live document
     */
    function _closeDocument(liveDocument) {
        $(liveDocument).off(".livedev");
        liveDocument.close();
    }
    
    /**
     * Removes the given CSS/JSDocument from _relatedDocuments. Signals that the
     * given file is no longer associated with the HTML document that is live (e.g.
     * if the related file has been deleted on disk).
     */
    function _handleRelatedDocumentDeleted(event, liveDoc) {
        if (_relatedDocuments[liveDoc.doc.url]) {
            delete _relatedDocuments[liveDoc.doc.url];
        }
            
        if (_server) {
            _server.remove(liveDoc);
        }
        
        _closeDocument(liveDoc);
    }

    /**
     * Update the status. Triggers a statusChange event.
     * @param {number} status new status
     * @param {?string} closeReason Optional string key suffix to display to
     *     user when closing the live development connection (see LIVE_DEV_* keys)
     */
    function _setStatus(status, closeReason) {
        // Don't send a notification when the status didn't actually change
        if (status === exports.status) {
            return;
        }
        
        exports.status = status;
        
        var reason = status === STATUS_INACTIVE ? closeReason : null;
        $(exports).triggerHandler("statusChange", [status, reason]);
    }

    /**
     * @private
     * Close all live documents
     */
    function _closeDocuments() {
        if (_liveDocument) {
            _closeDocument(_liveDocument);
            _liveDocument = undefined;
        }
        
        Object.keys(_relatedDocuments).forEach(function (url) {
            _closeDocument(_relatedDocuments[url]);
            delete _relatedDocuments[url];
        });
        
        // Clear all documents from request filtering
        if (_server) {
            _server.clear();
        }
    }
    
    function _resolveUrl(path) {
        return _server && _server.pathToUrl(path);
    }

    /**
     * @private
     * Create a live version of a Brackets document
     * @param {Document} doc
     * @param {Editor} editor
     * @return {?(LiveHTMLDocument|LiveCSSDocument)}
     */
    function _createLiveDocument(doc, editor) {
        var DocClass        = _classForDocument(doc),
            liveDocument    = new DocClass(_protocol, _resolveUrl, doc, editor);

        if (!DocClass) {
            return null;
        }

        $(liveDocument).on("errorStatusChanged.livedev", function (event, hasErrors) {
            if (isActive()) {
                _setStatus(hasErrors ? STATUS_SYNC_ERROR : STATUS_ACTIVE);
            }
        });

        return liveDocument;
    }

    /** Documents are considered to be out-of-sync if they are dirty and
     *  do not have "update while editing" support
     * @param {Document} doc
     */
    function _docIsOutOfSync(doc) {
        var docClass    = _classForDocument(doc),
            liveDoc     = _server && _server.get(doc.file.fullPath),
            isLiveEditingEnabled = liveDoc && liveDoc.isLiveEditingEnabled();

        return doc.isDirty && !isLiveEditingEnabled;
    }

/*
    function _styleSheetAdded(event, url) {
        var path = _server && _server.urlToPath(url),
            exists = !!_relatedDocuments[url];

        // path may be null if loading an external stylesheet.
        // Also, the stylesheet may already exist and be reported as added twice
        // due to Chrome reporting added/removed events after incremental changes
        // are pushed to the browser
        if (!path || exists) {
            return;
        }

        var docPromise = DocumentManager.getDocumentForPath(path);

        docPromise.done(function (doc) {
            if ((_classForDocument(doc) === LiveCSSDocument) &&
                    (!_liveDocument || (doc !== _liveDocument.doc))) {
                var liveDoc = _createLiveDocument(doc);
                if (liveDoc) {
                    _server.add(liveDoc);
                    _relatedDocuments[doc.url] = liveDoc;

                    $(liveDoc).on("deleted.livedev", _handleRelatedDocumentDeleted);
                }
            }
        });
    }
*/

    /**
     * @private
     * Determine an index file that can be used to start Live Development.
     * This function will inspect all files in a project to find the closest index file
     * available for currently opened document. We are searching for these files:
     *  - index.html
     *  - index.htm
     * 
     * If the project is configured with a custom base url for live developmment, then
     * the list of possible index files is extended to contain these index files too:
     *  - index.php
     *  - index.php3
     *  - index.php4
     *  - index.php5
     *  - index.phtm
     *  - index.phtml
     *  - index.cfm
     *  - index.cfml
     *  - index.asp
     *  - index.aspx
     *  - index.jsp
     *  - index.jspx
     *  - index.shm
     *  - index.shml
     * 
     * If a file was found, the promise will be resolved with the full path to this file. If no file
     * was found in the whole project tree, the promise will be resolved with null.
     * 
     * @return {jQuery.Promise} A promise that is resolved with a full path
     * to a file if one could been determined, or null if there was no suitable index
     * file.
     */
    function _getInitialDocFromCurrent() {
        var doc = _getCurrentDocument(),
            refPath,
            i;

        // TODO: FileUtils.getParentFolder()
        function getParentFolder(path) {
            return path.substring(0, path.lastIndexOf('/', path.length - 2) + 1);
        }

        function getFilenameWithoutExtension(filename) {
            var index = filename.lastIndexOf(".");
            return index === -1 ? filename : filename.slice(0, index);
        }

        // Is the currently opened document already a file we can use for Live Development?
        if (doc) {
            refPath = doc.file.fullPath;
            if (FileUtils.isStaticHtmlFileExt(refPath) || FileUtils.isServerHtmlFileExt(refPath)) {
                return new $.Deferred().resolve(doc);
            }
        }

        var result = new $.Deferred();

        var baseUrl = ProjectManager.getBaseUrl(),
            hasOwnServerForLiveDevelopment = (baseUrl && baseUrl.length);

        ProjectManager.getAllFiles().done(function (allFiles) {
            var projectRoot = ProjectManager.getProjectRoot().fullPath,
                containingFolder,
                indexFileFound = false,
                stillInProjectTree = true;
            
            if (refPath) {
                containingFolder = FileUtils.getDirectoryPath(refPath);
            } else {
                containingFolder = projectRoot;
            }
            
            var filteredFiltered = allFiles.filter(function (item) {
                var parent = getParentFolder(item.fullPath);
                
                return (containingFolder.indexOf(parent) === 0);
            });
            
            var filterIndexFile = function (fileInfo) {
                if (fileInfo.fullPath.indexOf(containingFolder) === 0) {
                    if (getFilenameWithoutExtension(fileInfo.name) === "index") {
                        if (hasOwnServerForLiveDevelopment) {
                            if ((FileUtils.isServerHtmlFileExt(fileInfo.name)) ||
                                    (FileUtils.isStaticHtmlFileExt(fileInfo.name))) {
                                return true;
                            }
                        } else if (FileUtils.isStaticHtmlFileExt(fileInfo.name)) {
                            return true;
                        }
                    } else {
                        return false;
                    }
                }
            };

            while (!indexFileFound && stillInProjectTree) {
                i = _.findIndex(filteredFiltered, filterIndexFile);

                // We found no good match
                if (i === -1) {
                    // traverse the directory tree up one level
                    containingFolder = getParentFolder(containingFolder);
                    // Are we still inside the project?
                    if (containingFolder.indexOf(projectRoot) === -1) {
                        stillInProjectTree = false;
                    }
                } else {
                    indexFileFound = true;
                }
            }

            if (i !== -1) {
                DocumentManager.getDocumentForPath(filteredFiltered[i].fullPath).then(result.resolve, result.resolve);
                return;
            }
            
            result.resolve(null);
        });

        return result.promise();
    }

    /**
     * @private
     * While still connected to the Inspector, do cleanup for agents,
     * documents and server.
     * @param {boolean} doCloseWindow Use true to close the window/tab in the browser
     * @return {jQuery.Promise} A promise that is always resolved
     */
    function _doInspectorDisconnect(doCloseWindow) {
        var closePromise;

        // Close live documents 
        _closeDocuments();
        
        if (_server) {
            // Stop listening for requests when disconnected
            _server.stop();

            // Dispose server
            _server = null;
        }
        
        // TODO: send message to browser page to close itself
    }
    
    /**
     * @private
     * Close the connection and the associated window
     * @param {boolean} doCloseWindow Use true to close the window/tab in the browser
     * @param {?string} reason Optional string key suffix to display to user (see LIVE_DEV_* keys)
     */
    function _close(doCloseWindow, reason) {
        if (exports.status !== STATUS_INACTIVE) {
            // Close live documents 
            _closeDocuments();
            
            if (_server) {
                // Stop listening for requests when disconnected
                _server.stop();

                // Dispose server
                _server = null;
            }
        }

        if (doCloseWindow) {
            // TODO: send message to browser page to close itself
        }
        
        _setStatus(STATUS_INACTIVE, reason || "explicit_close");
    }

    /**
     * Close the connection and the associated window asynchronously
     * @return {jQuery.Promise} Resolves once the connection is closed
     */
    function close() {
        return _close(true);
    }
    
    function _showWrongDocError() {
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            Strings.LIVE_DEVELOPMENT_ERROR_TITLE,
            Strings.LIVE_DEV_NEED_HTML_MESSAGE
        );
    }

    function _showLiveDevServerNotReadyError() {
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            Strings.LIVE_DEVELOPMENT_ERROR_TITLE,
            Strings.LIVE_DEV_SERVER_NOT_READY_MESSAGE
        );
    }

    function _createLiveDocumentForFrame(doc) {
        // create live document
        doc._ensureMasterEditor();
        _liveDocument = _createLiveDocument(doc, doc._masterEditor);
        _server.add(_liveDocument);
    }
    
    function _open(doc) {
        if (doc && _liveDocument && doc === _liveDocument.doc) {
            if (_server) {
                // Launch the URL in the browser. If it's the first one to connect back to us,
                // our status will transition to ACTIVE once it does so.
                _protocol.launch(_server.pathToUrl(doc.file.fullPath));

                // TODO: timeout if we don't get a connection within a certain time
                $(_liveDocument).one("connect", function (event, url) {
                    var doc = _getCurrentDocument();
                    if (doc && url === _resolveUrl(doc.file.fullPath)) {
                        _setStatus(STATUS_ACTIVE);
                    }
                });
            } else {
                console.error("LiveDevelopment._open(): No server active");
            }
        } else {
            // Unlikely that we would get to this state where
            // a connection is in process but there is no current
            // document
            close();
        }
    }
    
    // helper function that actually does the launch once we are sure we have
    // a doc and the server for that doc is up and running.
    function _doLaunchAfterServerReady(initialDoc) {
        // update status
        _setStatus(STATUS_CONNECTING);
        _createLiveDocumentForFrame(initialDoc);

        // start listening for requests
        _server.start();

        // open browser to the url
        _open(initialDoc);
    }
    
    function _prepareServer(doc) {
        var deferred = new $.Deferred(),
            showBaseUrlPrompt = false;
        
        _server = LiveDevServerManager.getServer(doc.file.fullPath);

        // Optionally prompt for a base URL if no server was found but the
        // file is a known server file extension
        showBaseUrlPrompt = !_server && FileUtils.isServerHtmlFileExt(doc.file.fullPath);

        if (showBaseUrlPrompt) {
            // Prompt for a base URL
            PreferencesDialogs.showProjectPreferencesDialog("", Strings.LIVE_DEV_NEED_BASEURL_MESSAGE)
                .done(function (id) {
                    if (id === Dialogs.DIALOG_BTN_OK && ProjectManager.getBaseUrl()) {
                        // If base url is specifed, then re-invoke _prepareServer() to continue
                        _prepareServer(doc).then(deferred.resolve, deferred.reject);
                    } else {
                        deferred.reject();
                    }
                });
        } else if (_server) {
            // Startup the server
            var readyPromise = _server.readyToServe();
            if (!readyPromise) {
                _showLiveDevServerNotReadyError();
                deferred.reject();
            } else {
                readyPromise.then(deferred.resolve, function () {
                    _showLiveDevServerNotReadyError();
                    deferred.reject();
                });
            }
        } else {
            // No server found
            deferred.reject();
        }
        
        return deferred.promise();
    }

    /**
     * Open the Connection and go live
     */
    function open() {
        // TODO: need to run _onDocumentChange() after load if doc != currentDocument here? Maybe not, since activeEditorChange
        // doesn't trigger it, while inline editors can still cause edits in doc other than currentDoc...
        _getInitialDocFromCurrent().done(function (doc) {
            var prepareServerPromise = (doc && _prepareServer(doc)) || new $.Deferred().reject(),
                otherDocumentsInWorkingFiles;

            if (doc && !doc._masterEditor) {
                otherDocumentsInWorkingFiles = DocumentManager.getWorkingSet().length;
                DocumentManager.addToWorkingSet(doc.file);

                if (!otherDocumentsInWorkingFiles) {
                    DocumentManager.setCurrentDocument(doc);
                }
            }

            // wait for server (StaticServer, Base URL or file:)
            prepareServerPromise
                .done(function () {
                    _doLaunchAfterServerReady(doc);
                })
                .fail(function () {
                    _showWrongDocError();
                });
        });
    }
    
    // TODO: highlight management should just happen through prefs probably
    /** Enable highlighting */
    function showHighlight() {
        var doc = getLiveDocForEditor(EditorManager.getActiveEditor());
        
        if (doc && doc.updateHighlight) {
            doc.updateHighlight();
        }
    }

    /** Hide any active highlighting */
    function hideHighlight() {
        // TODO: figure out right factoring for HighlightAgent
        // HighlightAgent.hide();
    }
    
    /** Redraw highlights **/
    function redrawHighlight() {
        // TODO: figure out right factoring for HighlightAgent
        // HighlightAgent.redraw();
    }

    /**
     * @private
     * DocumentManager currentDocumentChange event handler. 
     */
    function _onDocumentChange() {
        // TODO: only if live development is toggled on        
        var doc = _getCurrentDocument();
        if (!doc) {
            return;
        }
        
        // close the current session and begin a new session
        var docUrl = _server && _server.pathToUrl(doc.file.fullPath),
            isViewable = _server && _server.canServe(doc.file.fullPath);
        
        if (isViewable) {
            // Update status
            _setStatus(STATUS_CONNECTING);

            // clear live doc and related docs
            _closeDocuments();

            // create new live doc
            _createLiveDocumentForFrame(doc);

            open();
        } else {
            // TODO: only if this was a dependent file (e.g. a stylesheet)
            // Update highlight
            // showHighlight();
        }
    }

    /**
     * Triggered by a documentSaved event from DocumentManager.
     * @param {$.Event} event
     * @param {Document} doc
     */
    function _onDocumentSaved(event, doc) {
        if (!isActive() || !_server) {
            return;
        }
        
        var absolutePath            = doc.file.fullPath,
            liveDocument            = absolutePath && _server.get(absolutePath),
            liveEditingEnabled      = liveDocument && liveDocument.isLiveEditingEnabled  && liveDocument.isLiveEditingEnabled();
        
        // Skip reload if the saved document has live editing enabled
        if (liveEditingEnabled) {
            return;
        }
        
        var documentUrl     = _server.pathToUrl(absolutePath);
        // TODO: send message to browser to reload the document
    }

    /** Triggered by a change in dirty flag from the DocumentManager */
    function _onDirtyFlagChange(event, doc) {
        // TODO: only if this is a dependent file (e.g. a stylesheet)
        if (doc) {
            // Set status to out of sync if dirty. Otherwise, set it to active status.
            _setStatus(_docIsOutOfSync(doc) ? STATUS_OUT_OF_SYNC : STATUS_ACTIVE);
        }
    }

    function getCurrentProjectServerConfig() {
        return {
            baseUrl: ProjectManager.getBaseUrl(),
            pathResolver: ProjectManager.makeProjectRelativeIfPossible,
            root: ProjectManager.getProjectRoot().fullPath
        };
    }
    
//    function _createUserServer() {
//        return new UserServer(getCurrentProjectServerConfig());
//    }
//    
//    function _createFileServer() {
//        return new FileServer(getCurrentProjectServerConfig());
//    }

    function setTransport(transport) {
        _protocol.setTransport(transport);
    }

    /** Initialize the LiveDevelopment Session */
    function init(theConfig) {
        exports.config = theConfig;
        
        $(DocumentManager).on("currentDocumentChange", _onDocumentChange)
            .on("documentSaved", _onDocumentSaved)
            .on("dirtyFlagChange", _onDirtyFlagChange);
        $(ProjectManager).on("beforeProjectClose beforeAppClose", close);
        
        // Register user defined server provider
        // TODO: main LiveDevelopment does this already, so we don't want to do it again here.
//        LiveDevServerManager.registerServer({ create: _createUserServer }, 99);
//        LiveDevServerManager.registerServer({ create: _createFileServer }, 0);
        
        // Default transport for live connection messages - can be changed
        setTransport(NodeSocketTransport);
        
        // Initialize exports.status
        _setStatus(STATUS_INACTIVE);
    }

    function _getServer() {
        return _server;
    }

    function getServerBaseUrl() {
        return _server && _server.getBaseUrl();
    }
    
    // For unit testing
    exports._getServer                = _getServer;
    exports._getInitialDocFromCurrent = _getInitialDocFromCurrent;

    // Export public functions
    exports.open                = open;
    exports.close               = close;
    exports.getLiveDocForPath   = getLiveDocForPath;
    exports.showHighlight       = showHighlight;
    exports.hideHighlight       = hideHighlight;
    exports.redrawHighlight     = redrawHighlight;
    exports.init                = init;
    exports.isActive            = isActive;
    exports.getCurrentProjectServerConfig = getCurrentProjectServerConfig;
    exports.getServerBaseUrl    = getServerBaseUrl;
    exports.setTransport        = setTransport;
});