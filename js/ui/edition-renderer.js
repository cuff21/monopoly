(function(global) {
    'use strict';
    var UIHtml = global.UIHtml || (typeof module !== 'undefined' && module.exports ? require('./html-escape') : null);
    function renderSpecialDeedText(square, group) {
        var tiers = group.rules.rentTiers;
        if (square.kind === 'utility') return '<p>If one Utility is owned, rent is ' + UIHtml.escapeHTML(tiers[0]) + ' times the amount shown on the dice.</p><p>If both Utilities are owned, rent is ' + UIHtml.escapeHTML(tiers[1]) + ' times the amount shown on the dice.</p>';
        return '<div class="deed-rent-schedule">' + tiers.map(function(rent, index) {
            var label = index === 0 ? 'Rent' : 'If ' + (index + 1) + ' ' + group.label + ' are owned';
            return '<div class="deed-rent-row"><span>' + UIHtml.escapeHTML(label) + '</span><span>$' + UIHtml.escapeHTML(rent) + '</span></div>';
        }).join('') + '</div>';
    }
    var api = { renderSpecialDeedText: renderSpecialDeedText };
    global.EditionRenderer = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
