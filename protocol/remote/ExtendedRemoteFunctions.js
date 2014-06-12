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


/*jslint vars: true, plusplus: true, browser: true, nomen: true, indent: 4, forin: true, maxerr: 50, regexp: true */
/*global define, $, window, navigator, Node, console */

/**
 * ExtendRemoteFunctions defines the addtional functions to be executed in the browser. 
 */
function ExtendRemoteFunctions(obj) {
    "use strict";

    var ExtendedObj = function () {};
    ExtendedObj.prototype = obj;

    var reloadCSSCounter = 0;
    
    ExtendedObj.prototype.reloadCSS = function reloadCSS(url) {
        var i,
            links = document.getElementsByTagName('link'),
            link,
            found = false;
        reloadCSSCounter++;
        
        function updateCSS(url, link) {
            // a. for Firefox
            link.href = url + "?count=" + reloadCSSCounter; // added string so firefox won't cache

            //:TODO: Add browser check and do the following only for Chrome (also test with other browsers)
            // b. for Chrome
            // The following is needed so Chrome refreshes!
            // The side effect of this is that it flickers since it removes the element first
            //:TODO: Try to see if there's a way to get it to work on Chrome without flickering

            var parent = link.parentNode;
            var next = link.nextElementSibling;
            parent.removeChild(link);   // also tried link.disabled = true;
            parent.insertBefore(link, next);

        }
        
        if (links.length) {
            for (i = 0; i < links.length; i++) {
                link = links[i];
                if (link.href === url || link.href.indexOf(url + "?count=") === 0) {  // if the link starts with the url of the CSS file
                    // update the CSS
                    updateCSS(url, link);
                    found = true;
                    break;
                }
            }
            if (!found) { // Did not find the url in any of the linked files
                // Assume the file is loaded through @import
                // Since we don't know which one, reload all of them
                // This is kind of a hack to support @import for now
                //:TODO: We can pass the base links from the related docs instead of the 
                //imported file url to avoid this case.
                // Note: This works in Chrome, but not in Firefox since FF caches the imported files
                //:TODO: To make in work for FF, need to parse the CSS files and add a query to the imports
                // for example change @import url(a.css) to @import url(a.css?count=xyz)
                for (i = 0; i < links.length; i++) {
                    link = links[i];
                    updateCSS(link.href.substring(0, link.href.indexOf("?count=")) || link.href, link);
                }
            }
        }
    };

    return new ExtendedObj();
}