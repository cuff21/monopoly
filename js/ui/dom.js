// Shared native DOM operations for UI visibility, effects, and replaceable handlers.
(function(global) {
    'use strict';
    var displays = new WeakMap(), effects = new WeakMap(), handlers = new WeakMap();
    function nodes(target) {
        if (typeof target !== 'string') return target ? [target] : [];
        if (typeof document === 'undefined') return [];
        return Array.from(document.querySelectorAll(target));
    }
    function setVisible(target, visible) {
        nodes(target).forEach(function(node) {
            var effect = effects.get(node);
            if (effect) { effects.delete(node); effect.cancel(); }
            if (!visible) {
                if (node.style.display !== 'none') displays.set(node, node.style.display);
                node.style.display = 'none';
            } else {
                node.style.display = displays.get(node) || '';
                if (typeof getComputedStyle === 'function' && getComputedStyle(node).display === 'none') {
                    var defaults = { TABLE: 'table', TR: 'table-row', TD: 'table-cell', TH: 'table-cell', TBODY: 'table-row-group',
                        INPUT: 'inline-block', BUTTON: 'inline-block', SELECT: 'inline-block', SPAN: 'inline', A: 'inline' };
                    node.style.display = node.classList.contains('board-perimeter') ? 'grid' : defaults[node.tagName] || 'block';
                }
            }
        });
    }
    function fade(target, visible, duration, onComplete) {
        nodes(target).forEach(function(node) {
            var previous = effects.get(node);
            if (previous) { effects.delete(node); previous.cancel(); }
            setVisible(node, true);
            if (!node.animate || (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
                setVisible(node, visible); if (onComplete) onComplete(); return;
            }
            var opacity = typeof getComputedStyle === 'function' ? getComputedStyle(node).opacity : '1';
            var effect = node.animate([{ opacity: visible ? 0 : opacity }, { opacity: visible ? opacity : 0 }], { duration: duration });
            effects.set(node, effect);
            effect.finished.then(function() {
                if (effects.get(node) !== effect) return;
                effects.delete(node); setVisible(node, visible);
                if (onComplete) onComplete();
            }).catch(function() { /* Replacing an effect cancels its completion. */ });
        });
    }
    function listen(target, type, callback) {
        nodes(target).forEach(function(node) {
            var registered = handlers.get(node);
            if (!registered) { registered = new Map(); handlers.set(node, registered); }
            if (registered.has(type)) node.removeEventListener(type, registered.get(type));
            registered.delete(type);
            if (callback) { node.addEventListener(type, callback); registered.set(type, callback); }
        });
    }
    function scrollToBottom(target, smooth) {
        nodes(target).forEach(function(node) {
            if (node.scrollTo) node.scrollTo({ top: node.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
            else node.scrollTop = node.scrollHeight;
        });
    }
    var api = { nodes: nodes, setVisible: setVisible, fade: fade, listen: listen, scrollToBottom: scrollToBottom };
    global.DOMUI = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
