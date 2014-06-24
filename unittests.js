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
        
        describe("RelatedDocuments", function () {

            var htmlDocument,
                head,
                mockTransport;
                    
            var DocumentObserver = require("text!protocol/remote/DocumentObserver.js");
            DocumentObserver = eval("(" + DocumentObserver.trim() + ")()");
            
            beforeEach(function () {
                htmlDocument = window.document.implementation.createHTMLDocument();
                head = htmlDocument.getElementsByTagName('head')[0];
                mockTransport = jasmine.createSpyObj('mockTransoprt', ['send']);
                mockTransport.send.andCallFake(function (msg) { console.log(msg); });
            });
            
            afterEach(function () {
                htmlDocument = null;
                mockTransport = null;
            });
                 
            it('should return all the external JS files', function () {
                
                var s1Url = "http://some_url.com/s1.js";
                var s1 = htmlDocument.createElement('script');
                s1.type = "text/javascript";
                s1.src = s1Url;
                head.appendChild(s1);
                
                var s2Url = "http://some_url.com/s2.js";
                var s2 = htmlDocument.createElement('script');
                s2.type = "text/javascript";
                s2.src = s2Url;
                head.appendChild(s2);
                
                DocumentObserver.start(htmlDocument, mockTransport);
                var related = DocumentObserver.related();
                
                expect(related.scripts[s1Url]).toBe(true);
                expect(related.scripts[s2Url]).toBe(true);
                
            });
                
        });
    });
});