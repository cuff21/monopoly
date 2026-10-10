const assert = require('node:assert/strict');
const DOMUI = require('./js/ui/dom');

class NodeFixture extends EventTarget {
    constructor(tagName = 'DIV', display = 'none') {
        super(); this.tagName = tagName; this.style = {}; this.display = display;
        this.classList = { contains: name => name === this.className };
    }
}
async function run() {
    const saved = { document: global.document, getComputedStyle: global.getComputedStyle, matchMedia: global.matchMedia };
    const nodes = { row: new NodeFixture('TR'), board: new NodeFixture(), button: new NodeFixture('INPUT') };
    nodes.board.className = 'board-perimeter';
    global.document = { querySelectorAll: selector => selector.split(',').map(id => nodes[id.trim().slice(1)]).filter(Boolean) };
    global.getComputedStyle = node => ({ display: node.style.display || node.display, opacity: '0.5' });
    global.matchMedia = () => ({ matches: false });
    try {
        DOMUI.setVisible('#row, #board, #button', true);
        assert.equal(nodes.row.style.display, 'table-row');
        assert.equal(nodes.board.style.display, 'grid');
        assert.equal(nodes.button.style.display, 'inline-block');
        DOMUI.setVisible('#board', false); DOMUI.setVisible('#board', false); DOMUI.setVisible('#board', true);
        assert.equal(nodes.board.style.display, 'grid', 'repeated hiding preserves the display type');
        let oldClicks = 0, newClicks = 0;
        DOMUI.listen(nodes.button, 'click', () => oldClicks++);
        DOMUI.listen(nodes.button, 'click', () => newClicks++);
        nodes.button.dispatchEvent(new Event('click'));
        assert.equal(oldClicks, 0); assert.equal(newClicks, 1, 'rebinding must replace restart handlers');
        DOMUI.listen(nodes.button, 'click', null);
        nodes.button.dispatchEvent(new Event('click')); assert.equal(newClicks, 1);

        const effects = [];
        nodes.board.animate = frames => {
            let resolve, reject;
            const effect = { frames, finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
                finish: () => resolve(), cancel: () => { effect.cancelled = true; reject(new Error('cancelled')); } };
            effects.push(effect); return effect;
        };
        let staleCompletion = false;
        DOMUI.fade(nodes.board, false, 400, () => { staleCompletion = true; });
        DOMUI.fade(nodes.board, true, 400);
        assert.equal(effects[0].cancelled, true);
        effects[1].finish(); await Promise.resolve(); await Promise.resolve();
        assert.equal(staleCompletion, false); assert.equal(nodes.board.style.display, 'grid');
        assert.equal(effects[1].frames[1].opacity, '0.5', 'fades preserve translucent backgrounds');
        DOMUI.fade(nodes.board, true, 400);
        DOMUI.setVisible(nodes.board, false);
        assert.equal(effects[2].cancelled, true);
        await Promise.resolve();
        assert.equal(nodes.board.style.display, 'none', 'an old fade must not reopen a closed panel');
        global.matchMedia = () => ({ matches: true });
        DOMUI.fade(nodes.board, true, 400);
        assert.equal(effects.length, 3, 'decorative fades respect reduced motion');
        assert.equal(nodes.board.style.display, 'grid');
        const log = { scrollHeight: 300, scrollTo: options => { log.options = options; } };
        DOMUI.scrollToBottom(log, true);
        assert.deepEqual(log.options, { top: 300, behavior: 'smooth' });
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete global[key]; else global[key] = value;
        }
    }
    console.log('Native visibility, event cleanup, fade cancellation, and scrolling pass.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
