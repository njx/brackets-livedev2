/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
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

/*jslint evil: true */

/*global $, brackets, define, describe, it, xit, expect, beforeEach, afterEach, waitsFor, waitsForDone, runs, window, spyOn, jasmine */

define(function (require, exports, module) {
    "use strict";
    
    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils"),
        FileUtils       = brackets.getModule("file/FileUtils");
    
    describe("LiveDevelopment2", function () {
         
        // load from testWindow
        var testWindow,
            brackets,
            extensionRequire,
            CommandManager,
            Commands,
            EditorManager,
            DocumentManager,
            LiveDevelopment,
            LiveDevProtocol,
            LiveHTMLDocument,
            editor;
        
        var testFolder = FileUtils.getNativeModuleDirectoryPath(module) + "/unittest-files/",
            tempDir = SpecRunnerUtils.getTempDirectory(),
            allSpacesRE = /\s+/gi;

        beforeEach(function () {
            // Create a new window that will be shared by ALL tests in this spec.
            if (!testWindow) {
                runs(function () {
                    SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                        testWindow = w;
                        // Load module instances from brackets.test
                        brackets = testWindow.brackets;
                        CommandManager = brackets.test.CommandManager;
                        Commands = brackets.test.Commands;
                        EditorManager = brackets.test.EditorManager;
                        DocumentManager = brackets.test.DocumentManager;
                        extensionRequire = brackets.test.ExtensionLoader.getRequireContextForExtension("brackets-livedev2");
                        LiveDevelopment = extensionRequire("LiveDevelopment");
                        LiveDevProtocol = extensionRequire("protocol/LiveDevProtocol");
                    });
                });
                
                runs(function () {
                    SpecRunnerUtils.loadProjectInTestWindow(testFolder);
                });
            }
        });
        
        afterEach(function () {
            DocumentManager.closeAll();
            testWindow.close();
            testWindow = null;
            brackets = null;
            LiveDevelopment = null;
        });
        
        function waitsForLiveDevelopmentToOpen() {
            runs(function () {
                LiveDevelopment.open();
            });
            waitsFor(
                function isLiveDevelopmentActive() {
                    return LiveDevelopment.status === LiveDevelopment.STATUS_ACTIVE;
                },
                "livedevelopment.done.opened",
                5000
            );
        }

        describe("Start-up - LiveDevProtocolRemote", function () {
            
            it("should establish a browser connection for an opened html file", function () {
                //open a file
                runs(function () {
                    waitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]), "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
                });
                
                waitsForLiveDevelopmentToOpen();

                runs(function () {
                    expect(LiveDevelopment.status).toBe(LiveDevelopment.STATUS_ACTIVE);
                });
            });
            
            it("should send all external stylesheets as related docs on start-up", function () {
                var liveDoc;
                runs(function () {
                    waitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]), "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
                });
                waitsForLiveDevelopmentToOpen();
                runs(function () {
                    liveDoc = LiveDevelopment._getCurrentLiveDoc();
                });
                waitsFor(
                    function relatedDocsReceived() {
                        return (Object.getOwnPropertyNames(liveDoc.getRelated().stylesheets).length > 0);
                    },
                    "relateddocuments.done.received",
                    10000
                );
                runs(function () {
                    expect(liveDoc.isRelated(testFolder + "simple1.css")).toBeTruthy();
                });
                runs(function () {
                    expect(liveDoc.isRelated(testFolder + "simpleShared.css")).toBeTruthy();
                });
            });
            
            it("should send all import-ed stylesheets as related docs on start-up", function () {
                var liveDoc;
                runs(function () {
                    waitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]), "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
                });
                waitsForLiveDevelopmentToOpen();
                runs(function () {
                    liveDoc = LiveDevelopment._getCurrentLiveDoc();
                });
                waitsFor(
                    function relatedDocsReceived() {
                        return (Object.getOwnPropertyNames(liveDoc.getRelated().scripts).length > 0);
                    },
                    "relateddocuments.done.received",
                    10000
                );
                runs(function () {
                    expect(liveDoc.isRelated(testFolder + "import1.css")).toBeTruthy();
                });
            });
            
            it("should send all external javascript files as related docs on start-up", function () {
                var liveDoc;
                runs(function () {
                    waitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]), "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
                });
                waitsForLiveDevelopmentToOpen();
                
                runs(function () {
                    liveDoc = LiveDevelopment._getCurrentLiveDoc();
                });
                waitsFor(
                    function relatedDocsReceived() {
                        return (Object.getOwnPropertyNames(liveDoc.getRelated().scripts).length > 0);
                    },
                    "relateddocuments.done.received",
                    10000
                );
                runs(function () {
                    expect(liveDoc.isRelated(testFolder + "simple1.js")).toBeTruthy();
                });
            });
            
            it("should send notifications for added/removed stylesheets through link nodes", function () {
                var liveDoc;
                runs(function () {
                    waitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]), "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
                });
                waitsForLiveDevelopmentToOpen();
                
                runs(function () {
                    liveDoc = LiveDevelopment._getCurrentLiveDoc();
                });
                
                runs(function () {
                    var curDoc =  DocumentManager.getCurrentDocument();
                    curDoc.replaceRange('<link href="simple2.css" rel="stylesheet">\n', {line: 8, ch: 0});
                });
                
                waitsFor(
                    function relatedDocsReceived() {
                        return (Object.getOwnPropertyNames(liveDoc.getRelated().stylesheets).length === 4);
                    },
                    "relateddocuments.done.received",
                    10000
                );
                
                runs(function () {
                    expect(liveDoc.isRelated(testFolder + "simple2.css")).toBeTruthy();
                });
                
                runs(function () {
                    var curDoc =  DocumentManager.getCurrentDocument();
                    curDoc.replaceRange('', {line: 8, ch: 0}, {line: 8, ch: 50});
                });
                
                waitsFor(
                    function relatedDocsReceived() {
                        return (Object.getOwnPropertyNames(liveDoc.getRelated().stylesheets).length === 3);
                    },
                    "relateddocuments.done.received",
                    10000
                );
                
                runs(function () {
                    expect(liveDoc.isRelated(testFolder + "simple2.css")).toBeFalsy();
                });
            });
        });
    });
});