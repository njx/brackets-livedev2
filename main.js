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
/*global brackets, define, $, less, window */

/**
 * main integrates LiveDevelopment into Brackets
 *
 * This module creates two menu items:
 *
 *  "Go Live": open or close a Live Development session and visualize the status
 *  "Highlight": toggle source highlighting
 *
 * @require DocumentManager
 */
define(function main(require, exports, module) {
    "use strict";

    var DocumentManager     = brackets.getModule("document/DocumentManager"),
        Commands            = brackets.getModule("command/Commands"),
        AppInit             = brackets.getModule("utils/AppInit"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        Dialogs             = brackets.getModule("widgets/Dialogs"),
        DefaultDialogs      = brackets.getModule("widgets/DefaultDialogs"),
        UrlParams           = brackets.getModule("utils/UrlParams").UrlParams,
        Strings             = brackets.getModule("strings"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        StringUtils         = brackets.getModule("utils/StringUtils"),
        Menus               = brackets.getModule("command/Menus"),
        LiveDevelopment     = require("LiveDevelopment");

    var params = new UrlParams();

    // Status labels/styles are ordered: error, not connected, progress1, progress2, connected.
    var _statusTooltip = [
        Strings.LIVE_DEV_STATUS_TIP_NOT_CONNECTED,
        Strings.LIVE_DEV_STATUS_TIP_NOT_CONNECTED,
        Strings.LIVE_DEV_STATUS_TIP_PROGRESS1,
        Strings.LIVE_DEV_STATUS_TIP_PROGRESS2,
        Strings.LIVE_DEV_STATUS_TIP_CONNECTED,
        Strings.LIVE_DEV_STATUS_TIP_OUT_OF_SYNC,
        Strings.LIVE_DEV_STATUS_TIP_SYNC_ERROR
    ];

    var _statusStyle = ["warning", "", "info", "info", "success", "out-of-sync", "sync-error"];  // Status indicator's CSS class
    var _allStatusStyles = _statusStyle.join(" ");

    var _$btnGoLive; // reference to the GoLive button
    var _$btnHighlight; // reference to the HighlightButton

    /**
     * Change the appearance of a button. Omit text to remove any extra text; omit style to return to default styling;
     * omit tooltip to leave tooltip unchanged.
     */
    function _setLabel($btn, text, style, tooltip) {
        // Clear text/styles from previous status
        $("span", $btn).remove();
        $btn.removeClass(_allStatusStyles);

        // Set text/styles for new status
        if (text && text.length > 0) {
            $("<span class=\"label\">")
                .addClass(style)
                .text(text)
                .appendTo($btn);
        } else {
            $btn.addClass(style);
        }

        if (tooltip) {
            $btn.attr("title", tooltip);
        }
    }

    /**
     * Toggles LiveDevelopment and synchronizes the state of UI elements that reports LiveDevelopment status
     *
     * Stop Live Dev when in an active state (ACTIVE, OUT_OF_SYNC, SYNC_ERROR).
     * Start Live Dev when in an inactive state (ERROR, INACTIVE).
     * Do nothing when in a connecting state (CONNECTING, LOADING_AGENTS).
     */
    function _handleGoLiveCommand() {
        if (LiveDevelopment.status >= LiveDevelopment.STATUS_ACTIVE) {
            LiveDevelopment.close();
        } else if (LiveDevelopment.status <= LiveDevelopment.STATUS_INACTIVE) {
            if (!params.get("skipLiveDevelopmentInfo") && !PreferencesManager.getViewState("livedev2.afterFirstLaunch")) {
                PreferencesManager.setViewState("livedev2.afterFirstLaunch", "true");
                Dialogs.showModalDialog(
                    DefaultDialogs.DIALOG_ID_INFO,
                    Strings.LIVE_DEVELOPMENT_INFO_TITLE,
                    Strings.LIVE_DEVELOPMENT_INFO_MESSAGE
                ).done(function (id) {
                    LiveDevelopment.open();
                });
            } else {
                LiveDevelopment.open();
            }
        }
    }

    /** Called on status change */
    function _showStatusChangeReason(reason) {
        // Destroy the previous twipsy (options are not updated otherwise)
        _$btnGoLive.twipsy("hide").removeData("twipsy");
        
        // If there was no reason or the action was an explicit request by the user, don't show a twipsy
        if (!reason || reason === "explicit_close") {
            return;
        }

        // Translate the reason
        var translatedReason = Strings["LIVE_DEV_" + reason.toUpperCase()];
        if (!translatedReason) {
            translatedReason = StringUtils.format(Strings.LIVE_DEV_CLOSED_UNKNOWN_REASON, reason);
        }
        
        // Configure the twipsy
        var options = {
            placement: "left",
            trigger: "manual",
            autoHideDelay: 5000,
            title: function () {
                return translatedReason;
            }
        };

        // Show the twipsy with the explanation
        _$btnGoLive.twipsy(options).twipsy("show");
    }
    
    /** Create the menu item "Go Live" */
    function _setupGoLiveButton() {
        _$btnGoLive = $("<a id='toolbar-go-live-new'>").appendTo($("#main-toolbar .buttons"));
        _$btnGoLive.click(function onGoLive() {
            _handleGoLiveCommand();
        });
        $(LiveDevelopment).on("statusChange", function statusChange(event, status, reason) {
            // status starts at -1 (error), so add one when looking up name and style
            // See the comments at the top of LiveDevelopment.js for details on the
            // various status codes.
            _setLabel(_$btnGoLive, null, _statusStyle[status + 1], _statusTooltip[status + 1]);
            _showStatusChangeReason(reason);
        });

        // Initialize tooltip for 'not connected' state
        _setLabel(_$btnGoLive, null, _statusStyle[1], _statusTooltip[1]);
    }
    
    /** Maintains state of the Live Preview menu item */
    function _setupGoLiveMenu() {
        $(LiveDevelopment).on("statusChange", function statusChange(event, status) {
            // Update the checkmark next to 'Live Preview' menu item
            // Add checkmark when status is STATUS_ACTIVE; otherwise remove it
            //CommandManager.get("livedev2.live-preview").setChecked(status === LiveDevelopment.STATUS_ACTIVE);
            CommandManager.get("livedev2.live-preview").setEnabled(status === LiveDevelopment.STATUS_INACTIVE);
        });
    }

    function _updateHighlightCheckmark() {
        CommandManager.get("livedev2.live-highlight").setChecked(PreferencesManager.getViewState("livedev2.highlight"));
    }
    
    function _handlePreviewHighlightCommand() {
        PreferencesManager.setViewState("livedev2.highlight", !PreferencesManager.getViewState("livedev2.highlight"));
    }
    
    /** Initialize LiveDevelopment */
    AppInit.appReady(function () {
        params.parse();

        LiveDevelopment.init();
        _setupGoLiveButton();
        _setupGoLiveMenu();

        _updateHighlightCheckmark();
    });
    
    // init prefs
    PreferencesManager.stateManager.definePreference("livedev2.highlight", "boolean", true)
        .on("change", function () {
            _updateHighlightCheckmark();
        });
    
    // init commands
    CommandManager.register("(New) Live Preview", "livedev2.live-preview", _handleGoLiveCommand);
    CommandManager.register("(New) Live Preview Highlight", "livedev2.live-highlight", _handlePreviewHighlightCommand);
    CommandManager.get(Commands.FILE_LIVE_HIGHLIGHT).setEnabled(false);
    
    Menus.getMenu(Menus.AppMenuBar.FILE_MENU).addMenuItem("livedev2.live-preview");
    Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).addMenuItem("livedev2.live-highlight");
    
    ExtensionUtils.loadStyleSheet(module, "styles/styles.css");
});
