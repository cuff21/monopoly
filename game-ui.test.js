const assert = require('assert');
const UIHtml = require('./js/ui/html-escape');
const getCurrentRent = require('./js/core/rent');
const GameStateContext = require('./js/core/game-state-context');
const UIBridge = require('./js/core/ui-bridge');
const { BrowserUI } = require('./js/ui/browser-ui');
const { Game } = require('./js/game/game-core');
const TurnFlow = require('./js/game/turn-flow');
const TradeView = require('./js/ui/trade-view');
const RenderPanels = require('./js/ui/render-panels');
const PopupView = require('./js/ui/popup');
const EditionRenderer = require('./js/ui/edition-renderer');
const { Genotype } = require('./js/ai/ai-gen6/neat/genotype');
require('./js/ai/simulation-adapters');
require('./js/editions/edition-registry');
require('./js/editions/classic');
require('./js/editions/newyorkcity');
const { SimBoard } = require('./js/simulation/match-runner');
require('./js/game/property-actions');

function saveGlobals(names) {
	const saved = {};
	names.forEach(name => { saved[name] = global[name]; });
	return saved;
}

function restoreGlobals(saved) {
	Object.keys(saved).forEach(name => {
		if (saved[name] === undefined) delete global[name];
		else global[name] = saved[name];
	});
}

async function runTests() {
	console.log('Testing game and UI contracts...');
	const savedPaymentGlobals = saveGlobals(['document', 'updateMoney']);
	const paymentRendererCalls = [];
	global.document = undefined;
	global.updateMoney = () => paymentRendererCalls.push('updateMoney');
	try {
		const paymentState = GameStateContext.createState({ game: null });
		await GameStateContext.run(paymentState, function() {
			const payer = new global.Player('Payer', 'red');
			assert.strictEqual(payer.pay(200, 2), true);
			assert.strictEqual(payer.money, 1300);
			assert.strictEqual(payer.pay(1400, 2), false);
			assert.strictEqual(payer.money, -100);
			assert.strictEqual(payer.creditor, 2);
			assert.deepStrictEqual(paymentRendererCalls, []);
		});
	} finally {
		restoreGlobals(savedPaymentGlobals);
	}
	console.log('✔ Player payments update state without global rendering.');

	const cardUiCalls = [];
	const originalGlobalUpdateOwned = global.updateOwned;
	global.updateOwned = () => { throw new Error('card actions must not call the global renderer'); };
	try {
		const cardState = GameStateContext.createState({
			game: { ui: {
				updateOwned() { cardUiCalls.push('owned'); },
				updateMoney() { cardUiCalls.push('money'); }
			} },
			player: [null, { human: true, communityChestJailCard: false, chanceJailCard: false }],
			turn: 1,
			communityChestCards: [{ action(player) { player.communityChestJailCard = true; } }],
			chanceCards: [{ action(player) { player.chanceJailCard = true; } }]
		});
		await GameStateContext.run(cardState, function() {
			TurnFlow.communityChestAction(0);
			TurnFlow.chanceAction(0);
			assert.strictEqual(global.player[1].communityChestJailCard, true);
			assert.strictEqual(global.player[1].chanceJailCard, true);
			assert.deepStrictEqual(cardUiCalls, ['owned', 'money', 'owned', 'money']);
		});
	} finally {
		if (originalGlobalUpdateOwned === undefined) delete global.updateOwned;
		else global.updateOwned = originalGlobalUpdateOwned;
	}
	console.log('✔ Card effects update ownership through the active GameUI.');
	assert.strictEqual(UIHtml.escapeHTML(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
	assert.throws(function() {
		global.Monopoly.Editions.register('Invalid Edition', {});
	}, /must provide buildGroups/);
	const defaultSquare = new global.Square({ name: 'Default', presentation: { color: 'white', priceText: '' } });
	assert.strictEqual(defaultSquare.owner, 0);
	assert.strictEqual(defaultSquare.groupNumber, 0);
	assert.strictEqual(defaultSquare.price, 0);
	assert.strictEqual(defaultSquare.baserent, 0);
	assert.deepStrictEqual([defaultSquare.rent1, defaultSquare.rent2, defaultSquare.rent3, defaultSquare.rent4, defaultSquare.rent5], [0, 0, 0, 0, 0]);
	assert.strictEqual(defaultSquare.houseprice, 0);
	const onLand = function() {};
	const groupProfile = { kind: 'test' };
	const tokenImage = { src: 'token.png', height: 12, width: 12 };
	const rentText = function() { return 'special'; };
	const configuredSquare = new global.Square({
		name: 'Configured',
		rules: { price: 140, groupNumber: 5, baseRent: 10, rentTiers: [50, 150, 450, 625, 750] },
		presentation: { color: 'purple', priceText: '$140', boardName: 'Configured Square', tokenImage, rentText },
		behavior: { groupProfile, onLand }
	});
	assert.deepStrictEqual([configuredSquare.price, configuredSquare.groupNumber, configuredSquare.baserent, configuredSquare.rent1, configuredSquare.rent5], [140, 5, 10, 50, 750]);
	assert.strictEqual(configuredSquare.houseprice, 100);
	assert.strictEqual(configuredSquare.color, 'purple');
	assert.strictEqual(configuredSquare.pricetext, '$140');
	assert.deepStrictEqual(configuredSquare.display, { boardName: 'Configured Square', tokenImage, rentText });
	assert.strictEqual(configuredSquare.groupProfile, groupProfile);
	assert.strictEqual(configuredSquare.onLand, onLand);
	assert.strictEqual(EditionRenderer.formatRentText({ display: {} }, 125), '$125');
	assert.strictEqual(EditionRenderer.formatRentText({ display: { rentText: () => '<b>Custom</b>' } }, 125), '&lt;b&gt;Custom&lt;/b&gt;');
	const rentEditions = global.Monopoly.Editions;
	const previousRentEdition = rentEditions.getActiveName();
	const previousSquares = global.square;
	function assignRentGroups(squares) {
		squares.forEach(property => {
			if (property.groupNumber) {
				property.group = squares.reduce((indices, candidate, index) => {
					if (candidate.groupNumber === property.groupNumber) indices.push(index);
					return indices;
				}, []);
			}
		});
	}
	try {
		['Classic', 'NYC'].forEach(editionName => {
			rentEditions.setActive(editionName);
			const edition = rentEditions.getActive();
			const editionGroups = edition.buildGroups();
			const editionSquares = edition.buildSquares(editionGroups);
			assert.strictEqual(editionSquares.length, 40);
			assert.ok(editionSquares.every(property => property instanceof global.Square));
			assert.strictEqual(editionGroups.length, 11);
			for (let groupNumber = 1; groupNumber <= 10; groupNumber++) {
				assert.ok(editionGroups[groupNumber]);
				assert.ok(editionGroups[groupNumber].groupName);
				assert.ok(editionGroups[groupNumber].groupColor);
			}
			editionSquares.forEach(property => {
				if (property.groupNumber > 0) assert.ok(editionGroups[property.groupNumber]);
			});
			assignRentGroups(editionSquares);
			global.square = editionSquares;
			assert.ok(editionSquares[1].price > 0);
			assert.ok(editionSquares[1].rent1 > 0);
			assert.strictEqual(editionSquares[1].color, editionGroups[editionSquares[1].groupNumber].groupColor);
			assert.strictEqual(editionSquares[1].groupName, editionGroups[editionSquares[1].groupNumber].groupName);
			assert.strictEqual(editionSquares[1].pricetext, '$' + editionSquares[1].price);
			assert.strictEqual(editionSquares[1].groupProfile, editionGroups[editionSquares[1].groupNumber].rules);
			assert.strictEqual(editionSquares[1].display.boardName, editionName === 'Classic' ? 'Mediter-ranean Avenue' : undefined);
			assert.strictEqual(editionSquares[1].groupProfile.rentRule.mode, 'colorGroup');

			const colorProperty = editionSquares.find(property => property.groupNumber >= 3);
			colorProperty.group.forEach(index => { editionSquares[index].owner = 1; });
			assert.strictEqual(getCurrentRent(colorProperty.index || editionSquares.indexOf(colorProperty)), colorProperty.baserent * 2);
			colorProperty.house = 1;
			assert.strictEqual(getCurrentRent(editionSquares.indexOf(colorProperty)), colorProperty.rent1);
			colorProperty.house = 0;
			const transit = editionSquares.findIndex(property => property.groupProfile && property.groupProfile.kind === 'transit');
			const transitGroup = editionSquares[transit].group;
			assert.strictEqual(editionSquares[transit].display.tokenImage, editionGroups[1].presentation.tokenImage || undefined);
			editionSquares[transit].owner = 1;
			assert.strictEqual(getCurrentRent(transit), 25);
			transitGroup.forEach(index => { editionSquares[index].owner = 1; });
			assert.strictEqual(getCurrentRent(transit), 200);

			const utility = editionSquares.findIndex(property => property.groupProfile && property.groupProfile.kind === 'utility');
			const utilityGroup = editionSquares[utility].group;
			assert.strictEqual(editionSquares[utility].display.rentText, editionGroups[2].presentation.rentText);
			if (editionName === 'Classic') assert.strictEqual(editionSquares[utility].display.tokenImage.src, 'images/electric_icon.png');
			utilityGroup.forEach(index => { editionSquares[index].owner = 1; });
			assert.deepStrictEqual(getCurrentRent(utility), { type: 'diceMultiplier', multiplier: 10 });
			assert.strictEqual(EditionRenderer.formatRentText(editionSquares[utility], getCurrentRent(utility)), '10x dice');
			editionSquares[utilityGroup[1]].owner = 2;
			assert.deepStrictEqual(getCurrentRent(utility), { type: 'diceMultiplier', multiplier: 4 });
			assert.strictEqual(EditionRenderer.formatRentText(editionSquares[utility], getCurrentRent(utility)), '4x dice');
		});

		global.square = Array.from({ length: 8 }, () => ({ owner: 0 }));
		global.square[3] = {
			owner: 1,
			price: 100,
			groupNumber: 91,
			group: [3, 6],
			groupProfile: { rentRule: { mode: 'fixed', tiers: [15, 73] } }
		};
		global.square[6] = { owner: 1 };
		assert.strictEqual(getCurrentRent(3), 73);
		global.square[6].owner = 2;
		assert.strictEqual(getCurrentRent(3), 15);
		global.square[3].groupProfile.calculateRent = () => 91;
		assert.strictEqual(getCurrentRent(3), 91);
		global.square[3].groupProfile = { rentRule: { mode: 'colorGroup', monopolyMultiplier: 2 } };
		global.square[3].baserent = 20;
		global.square[6].owner = 1;
		assert.strictEqual(getCurrentRent(3), 40);
		global.square[6].owner = 2;
		assert.strictEqual(getCurrentRent(3), 20);
		global.square[6].owner = 1;
		global.square[3].groupProfile = {};
		assert.strictEqual(getCurrentRent(3), 40);
	} finally {
		rentEditions.setActive(previousRentEdition);
		if (previousSquares === undefined) delete global.square;
		else global.square = previousSquares;
	}
	console.log('✔ Rent calculations are edition-owned and independent of board positions and tooltip labels.');
	const previousEdition = global.Monopoly.Editions.getActiveName();
	const originalRandom = Math.random;
	const passiveBrains = Array.from({ length: 4 }, () => {
		const brain = Genotype.createInitial(126, 9);
		brain.edges.forEach(edge => { edge.weight = edge.destination === 130 ? -8 : 0; });
		return brain;
	});
	let timeout;
	let results;
	Math.random = () => 0.1;
	try {
		results = await Promise.race([Promise.all([
			new SimBoard(passiveBrains, 1, { edition: 'Classic', playerCount: 4 }).run(),
			new SimBoard(passiveBrains.slice(0, 3), 1, { edition: 'NYC', playerCount: 6 }).run()
		]), new Promise((resolve, reject) => {
			timeout = setTimeout(() => reject(new Error('Interleaved simulations did not complete.')), 3000);
		})]);
	} finally {
		Math.random = originalRandom;
		clearTimeout(timeout);
	}
	assert.strictEqual(results[0].length, 4);
	assert.strictEqual(results[1].length, 6);
	assert.strictEqual(global.Monopoly.Editions.getActiveName(), previousEdition);
	console.log('✔ Concurrent games retain isolated state and edition.');

	const editionGlobals = saveGlobals(['document']);
	global.document = undefined;
	delete require.cache[require.resolve('./js/editions/classic')];
	delete require.cache[require.resolve('./js/editions/newyorkcity')];
	require('./js/editions/classic');
	require('./js/editions/newyorkcity');
	const editions = global.Monopoly.Editions;
	const boardElements = {};
	global.document = {
		getElementById(id) {
			if (!boardElements[id]) {
				boardElements[id] = { textContent: '', children: [], appendChild(child) { this.children.push(child); } };
			}
			return boardElements[id];
		},
		createElement(tagName) { return { tagName }; }
	};
	try {
		assert.ok(editions.getNames().includes('Classic'));
		assert.ok(editions.getNames().includes('NYC'));
		assert.strictEqual(editions.setActive('Classic'), true);
		const classicEdition = editions.getActive();
		assert.strictEqual(classicEdition.display, undefined);
		assert.strictEqual(classicEdition.deeds, undefined);
		const classicSquares = classicEdition.buildSquares();
		EditionRenderer.renderSquareDisplay(classicSquares);
		assert.strictEqual(classicSquares[1].display.boardName, 'Mediter-ranean Avenue');
		assert.strictEqual(boardElements.cell1name.textContent, 'Mediter-ranean Avenue');
		assert.strictEqual(boardElements.enlarge5token.children[0].src, 'images/train_icon.png');
		assert.strictEqual(classicSquares[5].groupProfile, classicSquares[15].groupProfile);
		assert.match(EditionRenderer.renderSpecialDeedText(classicSquares[5].groupProfile), /Railroads/);
		assert.match(EditionRenderer.renderSpecialDeedText(classicSquares[12].groupProfile), /4 times/);
		assert.doesNotMatch(JSON.stringify(classicSquares.map(square => square.display)), /</);

		assert.strictEqual(editions.setActive('NYC'), true);
		const nycEdition = editions.getActive();
		assert.strictEqual(nycEdition.display, undefined);
		assert.strictEqual(nycEdition.deeds, undefined);
		const nycSquares = nycEdition.buildSquares();
		EditionRenderer.renderSquareDisplay(nycSquares);
		assert.strictEqual(nycSquares[24].display.boardName, 'blooming...');
		assert.strictEqual(boardElements.cell24name.textContent, 'blooming...');
		assert.strictEqual(nycSquares[5].groupProfile, nycSquares[15].groupProfile);
		assert.match(EditionRenderer.renderSpecialDeedText(nycSquares[5].groupProfile), /Transportations/);
		assert.doesNotMatch(JSON.stringify(nycSquares.map(square => square.display)), /</);
	} finally {
		editions.setActive(previousEdition);
		restoreGlobals(editionGlobals);
	}
	console.log('✔ Edition registry and UI renderer use structured display and deed data.');

	async function runTaxLanding(editionName, position, options) {
		assert.ok(editions.getNames().includes(editionName));
		editions.setActive(editionName);
		const edition = editions.getActive();
		const squares = edition.buildSquares();
		const payer = new global.Player('Taxpayer', 'red');
		payer.money = options.money;
		payer.position = position;
		const events = [];
		let taxChoice;
		const ui = {
			alert(text) { events.push(['alert', text]); },
			displayLanded(text) { events.push(['landed', text]); },
			updateMoney() {},
			updateFreeParking() { events.push(['freeParking']); },
			updatePosition() { return Promise.resolve(); },
			updateOwned() {},
			chooseTax(fixedAmount, percentageAmount, onChoose) {
				taxChoice = { fixedAmount, percentageAmount };
				onChoose(options.choosePercentage ? percentageAmount : fixedAmount);
			}
		};
		if (options.propertyValue) {
			squares[1].owner = payer.index;
			squares[1].price = options.propertyValue;
		}
		const state = GameStateContext.createState({
			game: { ui, getDie() { return 1; } },
			player: [null, payer],
			pcount: 1,
			turn: 1,
			square: squares,
			freeParkingTaxes: true,
			freeParkingPot: 0,
			auctionEnabled: false,
			pendingAuction: -1
		});
		await GameStateContext.run(state, () => TurnFlow.land(false));
		return { payer, state, events, taxChoice };
	}

	const classicCityTax = await runTaxLanding('Classic', 4, { money: 1000 });
	assert.strictEqual(classicCityTax.payer.money, 800);
	assert.strictEqual(classicCityTax.state.freeParkingPot, 200);
	assert.strictEqual(classicCityTax.payer.creditor, -1);
	const classicLuxuryTax = await runTaxLanding('Classic', 38, { money: 1000 });
	assert.strictEqual(classicLuxuryTax.payer.money, 900);
	assert.strictEqual(classicLuxuryTax.state.freeParkingPot, 100);
	const nycPercentageTax = await runTaxLanding('NYC', 4, { money: 1000, propertyValue: 100, choosePercentage: true });
	assert.deepStrictEqual(nycPercentageTax.taxChoice, { fixedAmount: 200, percentageAmount: 110 });
	assert.strictEqual(nycPercentageTax.payer.money, 890);
	assert.strictEqual(nycPercentageTax.state.freeParkingPot, 110);
	const nycFixedTax = await runTaxLanding('NYC', 4, { money: 1000, choosePercentage: false });
	assert.strictEqual(nycFixedTax.payer.money, 800);
	assert.strictEqual(nycFixedTax.state.freeParkingPot, 200);
	const nycLuxuryTax = await runTaxLanding('NYC', 38, { money: 1000 });
	assert.strictEqual(nycLuxuryTax.payer.money, 925);
	assert.strictEqual(nycLuxuryTax.state.freeParkingPot, 0);
	editions.setActive(previousEdition);
	console.log('✔ Square landing callbacks apply edition-specific tax rules through GameUI.');

	assert.ok(UIBridge.createDefaultUI() instanceof UIBridge.HeadlessUI);
	const savedAdapterGlobals = saveGlobals(['window', 'document']);
	try {
		global.window = global;
		global.document = {};
		delete require.cache[require.resolve('./js/ui/browser-ui')];
		const { BrowserUI: RegisteredBrowserUI } = require('./js/ui/browser-ui');
		assert.ok(UIBridge.createDefaultUI() instanceof RegisteredBrowserUI);
	} finally {
		restoreGlobals(savedAdapterGlobals);
		delete UIBridge.BrowserUI;
	}

	const rendererNames = ['addAlert', 'updateMoney', 'updatePosition', 'updateOwned', 'updateDice', 'updateFreeParkingDisplay', 'updateDrawnCard', 'popup'];
	const savedRenderers = saveGlobals(rendererNames);
	const rendererCalls = [];
	global.addAlert = (...args) => rendererCalls.push(['alert', ...args]);
	global.updateMoney = () => rendererCalls.push(['money']);
	global.updatePosition = () => { rendererCalls.push(['position']); return Promise.resolve('position'); };
	global.updateOwned = () => rendererCalls.push(['owned']);
	global.updateDice = (...args) => rendererCalls.push(['dice', ...args]);
	global.updateFreeParkingDisplay = () => rendererCalls.push(['freeParking']);
	global.updateDrawnCard = (...args) => { rendererCalls.push(['card', ...args]); return Promise.resolve('card'); };
	global.popup = (...args) => { rendererCalls.push(['popup', ...args]); return Promise.resolve('popup'); };
	try {
		const ui = new BrowserUI();
		ui.alert('test alert', 2, 3);
		ui.updateMoney();
		const positionResult = ui.updatePosition();
		ui.updateOwned();
		ui.updateDice(4, 5);
		ui.updateFreeParking();
		const cardResult = ui.updateDrawnCard('chance', 6);
		const popupResult = ui.popup('<p>test</p>', null, 'blank');
		ui.onGameOver('Winner');
		assert.deepStrictEqual(rendererCalls.slice(0, 7), [
			['alert', 'test alert', 2, 3], ['money'], ['position'], ['owned'],
			['dice', 4, 5], ['freeParking'], ['card', 'chance', 6]
		]);
		assert.deepStrictEqual(rendererCalls[7], ['popup', '<p>test</p>', null, 'blank', undefined]);
		assert.strictEqual(await positionResult, 'position');
		assert.strictEqual(await cardResult, 'card');
		assert.strictEqual(await popupResult, 'popup');
	} finally {
		restoreGlobals(savedRenderers);
	}
	console.log('✔ Browser adapter dispatch verified.');

	class FakeElement {
		constructor(tagName) {
			this.tagName = tagName;
			this.children = [];
			this.style = {};
			this.value = '';
			this.checked = false;
		}
		appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
		removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; return child; }
		insertRow() { return this.appendChild(new FakeElement('tr')); }
		insertCell() { return this.appendChild(new FakeElement('td')); }
		get lastChild() { return this.children[this.children.length - 1] || null; }
		get rows() { return this.children; }
		set textContent(value) { this._textContent = value; this.children = []; }
		get textContent() { return this._textContent || ''; }
	}
	const savedTradeGlobals = saveGlobals(['document', 'player', 'square', 'pcount']);
	const tradeRoot = new FakeElement('div');
	const tradeState = { initiator: null, recipient: null };
	['trade-leftp-property', 'trade-rightp-property', 'trade-leftp-name', 'trade-rightp-name', 'trade-leftp-money', 'trade-rightp-money'].forEach(id => {
		const element = new FakeElement('div');
		element.id = id;
		tradeRoot.appendChild(element);
	});
	function findTradeElement(root, id) {
		if (root.id === id) return root;
		for (const child of root.children) {
			const match = findTradeElement(child, id);
			if (match) return match;
		}
		return null;
	}
	global.document = {
		createElement: tagName => new FakeElement(tagName),
		getElementById: id => findTradeElement(tradeRoot, id)
	};
	global.player = [null,
		{ index: 1, name: 'Offerer', communityChestJailCard: false, chanceJailCard: false },
		{ index: 2, name: 'Recipient', communityChestJailCard: false, chanceJailCard: false }
	];
	global.pcount = 2;
	global.square = Array.from({ length: 40 }, (_, index) => ({ index, owner: 0, name: 'Property ' + index, color: '#fff', groupNumber: 0, group: [], house: 0, hotel: 0, mortgage: false }));
	global.square[1] = { ...global.square[1], owner: 1, groupNumber: 3, group: [1, 3] };
	global.square[3] = { ...global.square[3], owner: 2, groupNumber: 3, group: [1, 3] };
	try {
		TradeView.reset(tradeState, global.player[1], global.player[2], false);
		global.document.getElementById('tradeleftcheckbox1').checked = true;
		global.document.getElementById('traderightcheckbox3').checked = true;
		global.document.getElementById('trade-leftp-money').value = '75';
		global.document.getElementById('trade-rightp-money').value = '20';
		const offer = TradeView.read(tradeState);
		assert.strictEqual(offer.getMoney(), 55);
		assert.strictEqual(offer.getProperty(1), 1);
		assert.strictEqual(offer.getProperty(3), -1);
		TradeView.write(tradeState, new global.Trade(global.player[1], global.player[2], -30, [0, 1, 0, -1], 0, 0));
		assert.strictEqual(global.document.getElementById('tradeleftcheckbox1').checked, true);
		assert.strictEqual(global.document.getElementById('traderightcheckbox3').checked, true);
		assert.strictEqual(global.document.getElementById('trade-rightp-money').value, '30');
		global.player[1].name = 'Offerer <img src=x onerror=alert(1)>';
		global.player[2].name = 'Recipient <svg onload=alert(1)>';
		const summary = TradeView.formatResult('Offer', new global.Trade(global.player[1], global.player[2], 0, Array(40).fill(0), 1, -1));
		assert(summary.indexOf('Offerer &lt;img') < summary.indexOf('Recipient &lt;svg'));
		assert(summary.includes('Offerer &lt;img src=x onerror=alert(1)&gt; gives'));
		assert(summary.includes('Recipient &lt;svg onload=alert(1)&gt; gives'));
		assert(!summary.includes('<img') && !summary.includes('<svg'));
		assert(summary.indexOf('Get Out of Jail Free card') < summary.lastIndexOf('Get Out of Jail Free card'));
	} finally {
		restoreGlobals(savedTradeGlobals);
	}
	const cardSummary = TradeView.formatResult('Card swap', {
		getInitiator: () => ({ name: 'Offerer' }), getRecipient: () => ({ name: 'Recipient' }),
		getMoney: () => 0, getProperty: () => 0,
		getCommunityChestJailCard: () => 1, getChanceJailCard: () => -1
	});
	assert(cardSummary.indexOf('Get Out of Jail Free card') < cardSummary.lastIndexOf('Get Out of Jail Free card'));
	console.log('✔ Trade view behavior and name escaping verified.');

	const savedLegacyGlobals = saveGlobals(['player', 'square', 'pcount', 'turn', 'game', '$', 'document']);
	const unsafeName = 'Player <img src=x onerror=alert(1)>';
	global.player = [null, { index: 1, name: unsafeName, color: 'red', money: 100, human: false, AI: { profile: { name: '<svg onload=alert(1)>' } }, communityChestJailCard: false, chanceJailCard: false }];
	global.square = Array.from({ length: 40 }, (_, index) => ({ index, owner: 0, name: 'Property ' + index, color: '#fff', groupNumber: 0, group: [], house: 0, mortgage: false }));
	global.square[1] = { ...global.square[1], owner: 1, groupNumber: 3, group: [1] };
	global.pcount = 1;
	global.turn = 1;
	try {
		const badge = RenderPanels.playerBadge(1);
		assert(badge.includes('title=\'Player &lt;img src=x onerror=alert(1)&gt;\''));
		assert(!badge.includes('<img'));
		global.square[1].name = 'Property <img src=x onerror=alert(1)>';
		const legacySummary = RenderPanels.formatTradeResult('Offer <svg>', {
			getInitiator: () => global.player[1], getRecipient: () => global.player[1], getMoney: () => 0,
			getProperty: index => index === 1 ? 1 : 0, getCommunityChestJailCard: () => 0, getChanceJailCard: () => 0
		});
		assert(legacySummary.includes('Offer &lt;svg&gt;'));
		assert(legacySummary.includes('Player &lt;img src=x onerror=alert(1)&gt; gives'));
		assert(legacySummary.includes('Property &lt;img src=x onerror=alert(1)&gt;'));
		assert(!legacySummary.includes('<img') && !legacySummary.includes('<svg'));
		const stats = PopupView.getPlayerStatsHTML(1, true);
		assert(stats.includes('Player &lt;img src=x onerror=alert(1)&gt;'));
		assert(stats.includes('&lt;svg onload=alert(1)&gt;'));
		assert(!stats.includes('<img') && !stats.includes('<svg'));

		const elements = {
			pmoney: { innerHTML: '' }, p1moneybar: { style: {} }, p1money: { innerHTML: '' },
			p1moneyname: { innerHTML: 'unchanged', textContent: '' }, landed: { innerHTML: 'occupied' }, quickstats: { style: {} }
		};
		global.document = { getElementById: id => elements[id] || null };
		global.$ = () => ({ hide() { return this; }, show() { return this; } });
		global.game = { ui: { isHeadless: false } };
		RenderPanels.updateMoney();
		assert.strictEqual(elements.p1moneyname.textContent, unsafeName);
		assert.strictEqual(elements.p1moneyname.innerHTML, 'unchanged');
	} finally {
		restoreGlobals(savedLegacyGlobals);
	}
	console.log('✔ Legacy panel, stats, trade, and money labels use safe text/HTML encoding.');

	const savedBrowserGlobals = saveGlobals(['document', 'game', 'player', 'pcount', 'popup']);
	const auctionElements = {
		propertyname: { innerHTML: '' }, auctionparticipants: { innerHTML: '', querySelectorAll: () => [] },
		pname: { textContent: '' }, highestbid: { textContent: '' }, highestbidder: { textContent: '' },
		currentbidder: { textContent: '' }, bid: { value: '125', style: {}, focus() { this.focused = true; } }
	};
	const mortgageRow = { style: {} };
	const mortgageButton = { handler: null, getAttribute: () => '3', addEventListener(event, handler) { this.handler = handler; } };
	const taxButtons = {
		fixed: { addEventListener(event, handler) { this.handler = handler; } },
		percentage: { addEventListener(event, handler) { this.handler = handler; } }
	};
global.document = {
		getElementById: id => auctionElements[id] || (id === 'tax-fixed-button' ? taxButtons.fixed : id === 'tax-percentage-button' ? taxButtons.percentage : null),
		querySelectorAll: selector => selector === '[data-unmortgage-index]' ? [mortgageButton] : [],
		querySelector: selector => selector === "[data-unmortgage-row='3']" ? mortgageRow : null
	};
	global.player = [null, { index: 1, name: 'Bidder <img src=x onerror=alert(1)>', color: '#fff', bidding: true }];
	global.pcount = 1;
	let auctionSubmitCount = 0;
	global.game = { auctionBid: () => auctionSubmitCount++ };
	const uiPopupCalls = [];
	global.popup = (...args) => uiPopupCalls.push(args);
	try {
		const ui = new BrowserUI();
		ui.initializeAuction(5, { name: 'Reading Railroad' }, { name: 'Bidder' });
		assert.ok(auctionElements.propertyname.innerHTML.includes('Reading Railroad'));
		assert.strictEqual(auctionElements.currentbidder.textContent, "It is Bidder's turn to bid.");
		assert.strictEqual(auctionElements.highestbid.textContent, '0');
		assert.strictEqual(auctionElements.highestbidder.textContent, 'N/A');
		assert.strictEqual(ui.readAuctionBid(), 125);
		auctionElements.bid.onkeydown({ keyCode: 13 });
		assert.strictEqual(auctionSubmitCount, 1);
		ui.updateAuctionTurn('Next bidder', true);
		assert.strictEqual(auctionElements.bid.value, '');
		ui.setAuctionBidError('Invalid bid');
		ui.updateAuctionBid(250, 'Next bidder');
		assert.strictEqual(auctionElements.highestbid.textContent, 250);
		assert.strictEqual(auctionElements.highestbidder.textContent, 'Next bidder');
		ui.focusAuctionBid();
		assert.strictEqual(auctionElements.bid.focused, true);
		ui.openAuction(5, { name: 'Reading Railroad' }, { name: 'Bidder' });
		assert.ok(uiPopupCalls[0][0].includes("id='auctionparticipants'"));
		ui.onAuctionParticipants();
		assert.ok(auctionElements.auctionparticipants.innerHTML.includes('Bidder &lt;img src=x onerror=alert(1)&gt;'));
		assert.ok(!auctionElements.auctionparticipants.innerHTML.includes('<img'));
		ui.updateTurnDisplay({ name: 'Turn <img src=x onerror=alert(1)>' });
		assert.strictEqual(auctionElements.pname.textContent, 'Turn <img src=x onerror=alert(1)>');
		ui.onGameOver('Winner <svg onload=alert(1)>');
		assert.ok(uiPopupCalls[1][0].includes('Winner &lt;svg onload=alert(1)&gt; Wins!!'));
		assert.ok(!uiPopupCalls[1][0].includes('<svg'));
		ui.showMessage('A <B & C>');
		assert.strictEqual(uiPopupCalls[2][0], '<p>A &lt;B &amp; C&gt;</p>');
		ui.confirm('Owner <img src=x onerror=alert(1)> confirms?', () => {});
		assert.strictEqual(uiPopupCalls[3][0], '<p>Owner &lt;img src=x onerror=alert(1)&gt; confirms?</p>');
		assert.strictEqual(uiPopupCalls[3][2], 'Yes/No');
		ui.showCard('chance', 'Move <forward>', () => {});
		assert.ok(uiPopupCalls[4][0].includes('images/chance_icon.png'));
		assert.ok(uiPopupCalls[4][0].includes('Move &lt;forward&gt;'));
		const originalTradeFormatter = ui.formatTradeResult;
		ui.formatTradeResult = () => '<table>summary</table>';
		ui.showTradeResult('Trade', {});
		ui.formatTradeResult = originalTradeFormatter;
		assert.strictEqual(uiPopupCalls[5][0], '<p><table>summary</table></p>');
		let confirmedUnmortgageIndex = -1;
		ui.showBankruptcyUnmortgage('Creditor <One>', [{ index: 3, name: 'Property <Three>', color: '#fff', groupNumber: 3, price: 100 }], index => {
			confirmedUnmortgageIndex = index;
			return true;
		}, () => {});
		assert.ok(uiPopupCalls[6][0].includes('Creditor &lt;One&gt;'));
		assert.ok(uiPopupCalls[6][0].includes("data-unmortgage-index='3'"));
		assert.ok(uiPopupCalls[6][0].includes('Property &lt;Three&gt;'));
		mortgageButton.handler.call(mortgageButton);
		assert.strictEqual(confirmedUnmortgageIndex, 3);
		assert.strictEqual(mortgageRow.style.display, 'none');
		let chosenTax = null;
		ui.chooseTax(200, 175, amount => { chosenTax = amount; });
		taxButtons.percentage.handler();
		assert.strictEqual(chosenTax, 175);
		assert.ok(uiPopupCalls[7][0].includes('Pay $200') && uiPopupCalls[7][0].includes('Pay $175'));
	} finally {
		restoreGlobals(savedBrowserGlobals);
	}
	console.log('✔ Browser presentation and auction UI verified.');

	const gameStateNames = ['game', 'player', 'turn', 'pendingAuction', 'auctionEnabled', 'roll'];
	const savedGameState = saveGlobals(gameStateNames);
	const gameCalls = [];
	global.player = [null, { human: true, money: 1500 }];
	global.turn = 1;
	global.pendingAuction = -1;
	global.auctionEnabled = true;
	global.roll = () => gameCalls.push('roll');
	try {
		const game = new Game({ isHeadless: false, waitForPopupClose: async () => gameCalls.push('wait'), popup: () => gameCalls.push('popup') });
		game.auction = () => { gameCalls.push('auction'); return false; };
		await game.next();
		assert.deepStrictEqual(gameCalls, ['wait', 'auction', 'roll']);
	} finally {
		restoreGlobals(savedGameState);
	}
	console.log('✔ Turn flow awaits the UI contract.');

	const savedAuctionGlobals = saveGlobals(['game', 'player', 'square', 'turn', 'pcount', 'play']);
	try {
		const bidCalls = [];
		global.player = [{ index: 0, name: 'the bank', human: false }, ...Array.from({ length: 3 }, (_, index) => ({
			index: index + 1, name: 'Bidder ' + (index + 1), human: false, money: 1500,
			AI: { bid: () => { bidCalls.push(index + 1); return 0; } }
		}))];
		global.square = Array.from({ length: 40 }, () => ({ price: 0, owner: 0 }));
		global.square[1] = { price: 100, owner: 0, name: 'Test property' };
		global.turn = 1;
		global.pcount = 3;
		global.play = () => {};
		const headlessUI = { isHeadless: true, onAuctionHistory() {}, onAuctionParticipants() {}, closeAuction() {}, alert() {}, updateOwned() {}, updateAuctionBid() {}, focusAuctionBid() {} };
		const game = new Game(headlessUI);
		game.addPropertyToAuctionQueue(1);
		assert.strictEqual(game.auction(), true);
		assert.deepStrictEqual(bidCalls, [1, 2, 3]);
		global.turn = 0;
		game.addPropertyToAuctionQueue(1);
		assert.strictEqual(game.auction(), true);
		assert.deepStrictEqual(bidCalls, [1, 2, 3, 1, 2, 3]);

		let pathologicalBidCount = 0;
		global.player = [{ index: 0, name: 'the bank', human: false }, ...Array.from({ length: 3 }, (_, index) => ({
			index: index + 1, name: 'Bidder ' + (index + 1), human: false, money: 1500,
			pay(amount) { this.money -= amount; },
			AI: { bid: (property, currentBid) => { pathologicalBidCount++; return currentBid + 1; } }
		}))];
		global.square = Array.from({ length: 40 }, () => ({ price: 0, owner: 0 }));
		global.square[1] = { price: 100, owner: 0, name: 'Test property' };
		const boundedAuction = new Game(headlessUI);
		boundedAuction.addPropertyToAuctionQueue(1);
		assert.strictEqual(boundedAuction.auction(), true);
		assert.strictEqual(pathologicalBidCount, 200, 'a pathological auction should stop after the configured bid cap');
		assert.notStrictEqual(global.square[1].owner, 0, 'the capped auction should finalize instead of blocking the game');

		const interactiveCalls = [];
		global.player = [{ index: 0, name: 'the bank', human: false }, ...Array.from({ length: 3 }, (_, index) => ({
			index: index + 1, name: 'Bidder ' + (index + 1), human: false, money: 1500, AI: { bid: () => 0 }
		}))];
		global.square = Array.from({ length: 40 }, () => ({ price: 0, owner: 0 }));
		global.square[1] = { price: 100, owner: 0, name: 'Test property' };
		global.pcount = 3;
		global.play = () => {};
		global.turn = 1;
		global.player[1].AI.bid = () => { interactiveCalls.push(1); return NaN; };
		global.player[2].AI.bid = () => { interactiveCalls.push(2); return NaN; };
		global.player[3].AI.bid = () => { interactiveCalls.push(3); return 2000; };
		const interactiveUI = {
			isHeadless: false, openAuction() {}, onAuctionHistory() {}, onAuctionParticipants() {}, updateMoney() {},
			updateAuctionTurn() {}, closeAuction() {}, alert() {}, updateOwned() {}
		};
		const interactiveGame = new Game(interactiveUI);
		interactiveGame.addPropertyToAuctionQueue(1);
		assert.strictEqual(interactiveGame.auction(), true);
		assert.deepStrictEqual(interactiveCalls, [1, 2, 3]);
	} finally {
		restoreGlobals(savedAuctionGlobals);
	}
	console.log('✔ Headless and interactive auction progression verified.');

	const savedActionGlobals = saveGlobals(['game', 'player', 'square', 'turn', 'pendingAuction']);
	const actionCalls = [];
	const actionUI = {};
	['updateButtonState', 'updateMoney', 'alert', 'updateOwned', 'hideLanded', 'showMessage', 'popup', 'updateMortgageButton', 'onMortgageChanged', 'onHouseChanged'].forEach(method => {
		actionUI[method] = (...args) => actionCalls.push([method, ...args]);
	});
	global.game = { ui: actionUI };
	global.player = [null, new global.Player('Test player', 'red')];
	global.player[1].index = 1;
	global.square = Array.from({ length: 40 }, () => ({ house: 0, hotel: 0 }));
	global.square[1] = { name: 'Test property', pricetext: '$100', price: 100, owner: 0, mortgage: false, house: 0, hotel: 0, houseprice: 50, group: [1] };
	global.square[2] = { name: 'Unaffordable property', pricetext: '$500', price: 500, owner: 0, mortgage: false, house: 0, hotel: 0, houseprice: 50, group: [2] };
	global.player[1].money = 500;
	global.player[1].position = 1;
	global.turn = 1;
	global.pendingAuction = -1;
	try {
		global.buy();
		assert.strictEqual(global.square[1].owner, 1);
		assert.strictEqual(global.mortgage(1), true);
		assert.strictEqual(global.unmortgage(1), true);
		assert.strictEqual(global.buyHouse(1), true);
		assert.strictEqual(global.sellHouse(1), true);
		global.player[1].position = 2;
		global.player[1].money = 10;
		global.buy();
		for (const method of ['alert', 'updateMortgageButton', 'onMortgageChanged', 'onHouseChanged', 'hideLanded', 'showMessage']) {
			assert.ok(actionCalls.some(call => call[0] === method), method + ' should dispatch through GameUI');
		}
	} finally {
		restoreGlobals(savedActionGlobals);
	}
	console.log('✔ Property actions dispatch through GameUI.');

	console.log('All game and UI tests passed.');
}

runTests().catch(error => {
	console.error(error);
	process.exitCode = 1;
});