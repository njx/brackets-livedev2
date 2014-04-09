This is an experimental repo for prototyping how we might replace the current live development architecture in Brackets with something more flexible that isn't tied solely to Chrome Developer Tools. It's based on the current Live Development code in Brackets, and can be installed (hackily) as an extension.

More notes are coming - these are rough notes.

### What's working

If you install the extension, you'll get a second lightning bolt on the toolbar. You can open an HTML page and then click it to enter HTML live development using the extension. This will launch the page in your default browser. You can also copy and paste the URL from that browser into any other browser and do live development in the other browser.

### What's not working

Lots:

* CSS live development isn't implemented - this will need code to handle hot replacement of stylesheets in the browser
* Closing live dev doesn't close the window in the browser. This might be impossible due to the restriction that JS can't close windows that aren't opened via JS, but we might want to at least show something in the browser indicating that the connection was terminated.
* Menu items don't work/reflect state (artifact of this being an extension that duplicates the functionality, probably not worth fixing)
* I wanted to change up how the Server stuff worked, but it turned out not to be necessary for the prototype and it might just be orthogonal.
* Still needs a fair amount of code cleanup and documentation

Bugs/cleanup/TODO:

* Lightning bolt status is wrong - never turns off
* Haven't thought through how we should indicate in the UI when multiple browser clients are active, and whether we should turn the lightning bolt off when the last one disconnects
* Doesn't show an error if the browser never connects back
* _ prefixing of private members isn't consistent; other code style cleanup
* spurious errors when socket is closed
* hard-coded port number for WebSocket server (might be fine)
* Lots of TODOs in the code
* Probably lots of other bugs

### Basic architecture

The primary difference in this architecture is that communication with the browser is done via an injected script rather than the native remote debugging interface, and the browser connects back to Brackets rather than Brackets connecting to the browser. This makes it so:

* launching a preview and establishing the connection between the previewed page and Brackets are much simpler, and can be largely decoupled
* live preview can work in any browser, not just Chrome
* multiple browsers can connect to the same live preview session in Brackets
* browsers could theoretically connect from anywhere on the network that can see Brackets (though right now it's only implemented for localhost)
* opening dev tools in the browser doesn't break live preview

Communication between Brackets and the browser is factored into three layers:

* a low-level "transport" layer, which is responsible for launching live preview in the browser and providing a simple textual message bus between the browser and Brackets.
* the "protocol" layer, which sits on top of the transport layer and provides the actual semantic behavior (currently just "evaluate in browser")
* the injected RemoteFunctions script, which is the same as in today's LiveDevelopment and provides Brackets-specific functionality (highlighting, DOM edit application) on top of the core protocol.

The reason for this factoring is so that the transport layer can be swapped out for different use cases, and so that anything higher-level we need that can be easily built in terms of eval doesn't have to be built into the protocol. 

The transport layer currently implemented uses a WebSocket server in Node, coupled with an injected script in the browser that connects back to that server. However, this could easily be swapped out for a different transport layer that supports a preview iframe directly inside Brackets, where the communication is via `postMessage()`.

The protocol layer currently exposes a very simple API that just contains specific protocol functions (currently just "evaluate", which evals in the browser). I chose not to implement a CDT-like facade (the Inspector class), but we could decide to do that if we wanted. The over-the-wire protocol is a JSON message that more or less looks like the CDT wire protocol, although it's not an exact match right now - again, we could decide to make it exactly mimic CDT if we wanted.

If we want to eventually reintroduce a CDT connection (or hook up to RemoteDebug), we have two choices: we could either just implement it as a separate transport, or we could implement it as a separate protocol impl entirely. Implementing it as a transport would be easier, and would be fine for talking to our own injected script; but it would only make sense for talking to CDT-specific functionality if we were very good about our wire protocol looking like the CDT wire protocol in general. Otherwise, we would probably want to consider swapping out the protocol entirely.

TODO: more detailed notes about the interface transports are expected to implement, the difference between the transport messaging and the protocol messaging, how multiple clients work, the difference between the various injected scripts, etc.

### Changes from existing LiveDevelopment code

* the existing code for talking to Chrome Developer Tools via the remote debugging interface is gone for now (see below)
* CSSDocument and HTMLDocument were renamed to LiveCSSDocument and LiveHTMLDocument, with a new LiveDocument base class
* the "agents" are all gone - a lot of them were dead code anyway; other functionality was rolled into LiveDocument
* communication is factored into transport and protocol layers (see above)
* HTMLInstrumentation and HTMLSimpleDOM were modified slightly (which is why they're copied into the extension), to make it possible to inject the remote scripts and to fix an issue with re-instrumenting the HTML when a second browser connects to Live Development. The former change is harmless; the latter change would need some review or possibly more work in order to merge into master. 
* ignore the changes to main.js and the copied styles for now - those were just to make this work as an extension and avoid conflicting with the existing LiveDocument functionality