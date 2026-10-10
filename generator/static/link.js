"use strict";
// The link pages: /call (droidtop's action links, grammar 2: literal API calls joined by &, any of them, or the whole
// list, base64url as b64:...) and the older /add-catalog and /install-plugin. Each validates what the link carries,
// lists it in plain text, and offers "Open in droidtop" and a copy button. The page only forwards; droidtop reads
// the link again, shows each call for approval and runs nothing until the person confirms.
(function (root) {
  var MAX = 2048;
  var ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

  // A catalog address: an https URL with a host and no embedded credentials. Anything else is null.
  function httpsAddress(value) {
    if (typeof value !== "string") return null;
    var text = value.trim();
    if (text.length === 0 || text.length > MAX) return null;
    var url;
    try { url = new URL(text); } catch (error) { return null; }
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  }

  function pluginId(value) {
    return typeof value === "string" && ID.test(value) ? value : null;
  }

  function addCatalogLink(address) {
    return "droidtop://add-catalog?address=" + encodeURIComponent(address);
  }

  function installPluginLink(address, id) {
    return "droidtop://install-plugin?" + (address ? "catalog=" + encodeURIComponent(address) + "&" : "") + "id=" + encodeURIComponent(id);
  }

  // What a page URL's query asks for: {mode, address, id, link} or {mode, error}.
  function parse(mode, search) {
    var params = new URLSearchParams(search);
    if (mode === "add-catalog") {
      var address = httpsAddress(params.get("address") || params.get("url"));
      if (!address) return { mode: mode, error: "This is not a catalog link: it has no https catalog address." };
      return { mode: mode, address: address, link: addCatalogLink(address) };
    }
    var id = pluginId(params.get("id"));
    if (!id) return { mode: mode, error: "This is not a plugin link: it names no valid plugin." };
    var raw = params.get("catalog");
    var catalog = null;
    if (raw !== null && raw !== "") {
      catalog = httpsAddress(raw);
      if (!catalog) return { mode: mode, error: "This is not a plugin link: its catalog address is not an https address." };
    }
    return { mode: mode, address: catalog, id: id, link: installPluginLink(catalog, id) };
  }

  var OP = /^([a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+|[A-Za-z0-9][A-Za-z0-9._-]{0,127}:[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*)$/;

  function fromBase64Url(text) {
    var b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var binary = (typeof atob === "function") ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  // The calls in already-decoded text, the same way droidtop reads them: an op name, a JSON object in parentheses
  // (an & or ) inside a JSON string belongs to the string), joined by &; b64: one level deep. Throws with a reason.
  function readCalls(text, allowBase64) {
    var calls = [];
    var i = 0;
    while (i < text.length) {
      if (text.startsWith("b64:", i)) {
        if (!allowBase64) throw new Error("a base64 call may not hold another base64 call");
        var end = text.indexOf("&", i);
        if (end < 0) end = text.length;
        var decoded;
        try { decoded = fromBase64Url(text.substring(i + 4, end)); } catch (error) { throw new Error("a b64: call is not base64url"); }
        calls = calls.concat(readCalls(decoded, false));
        i = end + 1;
        continue;
      }
      var open = text.indexOf("(", i);
      if (open < 0) throw new Error("not a call: " + text.substring(i, i + 60));
      var op = text.substring(i, open).trim();
      if (!OP.test(op)) throw new Error("not an op name: " + op.substring(0, 60));
      var inString = false, escaped = false, depth = 0, close = -1;
      for (var j = open + 1; j < text.length; j++) {
        var c = text[j];
        if (escaped) escaped = false;
        else if (inString && c === "\\") escaped = true;
        else if (c === '"') inString = !inString;
        else if (inString) continue;
        else if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") depth--;
        else if (c === ")" && depth === 0) { close = j; break; }
      }
      if (close < 0) throw new Error("the arguments of " + op + " are not closed");
      var body = text.substring(open + 1, close).trim();
      var args = {};
      if (body) {
        try { args = JSON.parse(body); } catch (error) { throw new Error("the arguments of " + op + " are not JSON"); }
        if (args === null || typeof args !== "object" || Array.isArray(args)) throw new Error("the arguments of " + op + " are not an object");
      }
      calls.push({ op: op, args: args });
      i = close + 1;
      if (i < text.length) {
        if (text[i] !== "&") throw new Error("calls are joined with &");
        i++;
      }
    }
    return calls;
  }

  // An action link page's query: {mode, calls, link} or {mode, error}. The droidtop link carries the same query.
  function parseCall(search) {
    var query = search.charAt(0) === "?" ? search.substring(1) : search;
    if (query.length > 8192) return { mode: "call", error: "This link is too long." };
    var text;
    try { text = decodeURIComponent(query); } catch (error) { return { mode: "call", error: "This link is not readable text." }; }
    if (text !== "v=2" && text.indexOf("v=2&") !== 0) return { mode: "call", error: "This is not a droidtop link this page knows (it must start with v=2)." };
    var calls;
    try { calls = readCalls(text.substring(4), true); } catch (error) { return { mode: "call", error: "This link is not valid: " + error.message + "." }; }
    if (calls.length === 0) return { mode: "call", error: "This link asks for nothing." };
    if (calls.length > 10) return { mode: "call", error: "This link has more than 10 calls." };
    return { mode: "call", calls: calls, link: "droidtop://call?" + query };
  }

  var api = { httpsAddress: httpsAddress, pluginId: pluginId, addCatalogLink: addCatalogLink, installPluginLink: installPluginLink, parse: parse, parseCall: parseCall, readCalls: readCalls };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  function el(name, className, text) {
    var node = document.createElement(name);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function show() {
    var app = document.getElementById("app");
    var mode = document.body.getAttribute("data-mode");
    var result = mode === "call" ? parseCall(window.location.search) : parse(mode, window.location.search);
    app.textContent = "";
    if (result.error) {
      app.appendChild(el("p", "error", result.error));
      app.appendChild(el("p", "note", "Nothing was done. Ask whoever sent you the link for a new one."));
      return;
    }
    var panel = el("div", "panel");
    if (mode === "call") {
      panel.appendChild(el("p", "", "This link asks droidtop to do the following. droidtop shows each step and asks you before it does any of them."));
      var list = el("ol", "calls");
      result.calls.forEach(function (call) { list.appendChild(el("li", "", call.op + " " + JSON.stringify(call.args))); });
      panel.appendChild(list);
    } else if (mode === "install-plugin") {
      panel.appendChild(el("p", "", "Plugin: " + result.id));
      panel.appendChild(el("p", "note", result.address ? "From the catalog below." : "From droidtop's own catalog."));
    } else {
      panel.appendChild(el("p", "", "A catalog is asking to be added to droidtop. droidtop shows its notice and asks you before it adds anything."));
    }
    if (result.address) {
      var label = el("label", "", "Catalog address");
      label.setAttribute("for", "address");
      var input = el("input");
      input.id = "address";
      input.readOnly = true;
      input.value = result.address;
      panel.appendChild(label);
      panel.appendChild(input);
    }
    var actions = el("p", "actions");
    var open = el("a", "btn primary", mode === "install-plugin" ? "Open in droidtop" : "Open in droidtop");
    open.href = result.link;
    actions.appendChild(open);
    var status = el("p", "note");
    status.setAttribute("role", "status");
    if (mode === "call") {
      var copyLink = el("button", "btn", "Copy link");
      copyLink.type = "button";
      copyLink.addEventListener("click", function () {
        var said = function (text) { return function () { status.textContent = text; }; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(result.link).then(said("Copied."), said("Copy the link from the address bar."));
        else status.textContent = "Copy the link from the address bar.";
      });
      actions.appendChild(copyLink);
    }
    if (result.address) {
      var copy = el("button", "btn", "Copy address");
      copy.type = "button";
      copy.addEventListener("click", function () {
        var done = function () { status.textContent = "Copied."; };
        var fallback = function () {
          var field = document.getElementById("address");
          field.focus();
          field.select();
          try { status.textContent = document.execCommand("copy") ? "Copied." : "Select the address above and copy it."; }
          catch (error) { status.textContent = "Select the address above and copy it."; }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(result.address).then(done, fallback);
        else fallback();
      });
      actions.appendChild(copy);
    }
    panel.appendChild(actions);
    panel.appendChild(status);
    app.appendChild(panel);
    app.appendChild(el("p", "note", "Nothing happens when you press Open in droidtop? Then droidtop is not installed on this device. It is an Android app."
      + (result.address ? " You can copy the address and paste it under Settings > Plugins > Add > More catalogs." : "")));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show); else show();
})(this);
