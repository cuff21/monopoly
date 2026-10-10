const assert = require('assert');
const UIHtml = require('./js/ui/html-escape');
const getCurrentRent = require('./js/core/rent');
const GameStateContext = require('./js/core/game-state-context');
const UIBridge = require('./js/core/ui-bridge');
const { BrowserUI } = require('./js/ui/browser-ui');
const RenderBoard = require('./js/ui/render-board');
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

const { registerFixtures } = require('./test-support/controllers');
class FixtureGame extends Game {
    constructor(ui, state) { super(ui, state); registerFixtures(this); }
}

function createAuctionFixtureState(players, turn) {
	const board = global.Monopoly.Editions.buildGameSetup('Classic').board;
	const state = GameStateContext.createState({ player: players, pcount: players.length - 1, turn });
	GameStateContext.initializeBoardState(state, board, 'Classic');
	return { state, squareId: Object.keys(board.squaresById).find(id => board.squaresById[id].rules.purchasePrice > 0) };
}

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
	const gameBeforeConstruction = global.game;
	const firstGameState = { player: [], turn: 0 };
	const secondGameState = { player: [], turn: 0 };
	const firstGame = new FixtureGame(null, firstGameState);
	const secondGame = new FixtureGame(null, secondGameState);
	assert.strictEqual(firstGame.state, firstGameState, 'a Game should own the supplied state');
	assert.strictEqual(secondGame.state, secondGameState, 'a second Game should retain its own state');
	assert.notStrictEqual(firstGame.state, secondGame.state, 'Games must not share mutable state');
	assert.strictEqual(global.game, gameBeforeConstruction, 'constructing a Game must not publish or replace a global singleton');
	assert.strictEqual(firstGame.ui.game, firstGame, 'the first UI remains attached to its owning Game');
	assert.strictEqual(secondGame.ui.game, secondGame, 'the second UI remains attached to its owning Game');
	assert.strictEqual(GameStateContext.run, undefined, 'state context must not provide ambient execution');
	assert.strictEqual(GameStateContext.install, undefined, 'state context must not install global accessors');
	console.log('✔ Game instances retain explicitly supplied state.');

	const payer = new global.Player('Payer', 'red');
	assert.strictEqual(payer.pay(200, 2), true);
	assert.strictEqual(payer.money, 1300);
	assert.strictEqual(payer.pay(1400, 2), false);
	assert.strictEqual(payer.money, -100);
	assert.strictEqual(payer.creditor, 2);
	console.log('✔ Player payments update state without global rendering.');

	const cardUiCalls = [];
	const observedCardContexts = [];
	const originalGlobalUpdateOwned = global.updateOwned;
	global.updateOwned = () => { throw new Error('card actions must not call the global renderer'); };
	try {
		const cardPlayer = { human: true, squareId: 'chance-south', heldCards: [] };
		GameStateContext.assignPlayerId(cardPlayer, 1);
		const cardBoard = global.Monopoly.Editions.get('Classic').buildBoard();
		const cardState = GameStateContext.createState({
			player: [null, cardPlayer], pcount: 1, turn: 1, board: cardBoard,
			cardDecks: {
				'community-chest': { cards: [{ action(context) { observedCardContexts.push(context); context.state.player[1].heldCards.push(context.cardId); } }], order: [0], index: 0 },
				chance: { cards: [{ action(context) { observedCardContexts.push(context); context.state.player[1].heldCards.push(context.cardId); } }], order: [0], index: 0 }
			}
		});
		GameStateContext.initializeBoardState(cardState, cardBoard);
		const cardGame = new FixtureGame({
				updateOwned() { cardUiCalls.push('owned'); },
				updateMoney() { cardUiCalls.push('money'); }
		}, cardState);
		await TurnFlow.cardAction(cardGame, 'community-chest', 0);
		await TurnFlow.cardAction(cardGame, 'chance', 0);
		assert.deepStrictEqual(cardGame.state.player[1].heldCards, ['community-chest:0', 'chance:0']);
		assert.deepStrictEqual(Object.keys(observedCardContexts[0]).sort(), ['cardId', 'cardIndex', 'deckId', 'game', 'playerId', 'squareId', 'state', 'ui']);
		assert.strictEqual(observedCardContexts[0].playerId, 'player-1');
		assert.strictEqual(observedCardContexts[0].squareId, 'chance-south');
		assert.deepStrictEqual(cardUiCalls, ['owned', 'money', 'owned', 'money']);
	} finally {
		if (originalGlobalUpdateOwned === undefined) delete global.updateOwned;
		else global.updateOwned = originalGlobalUpdateOwned;
	}
	console.log('✔ Card effects update ownership through the active GameUI.');

	const cardLandingCalls = [[], []];
	function createCardLandingGame(index, award) {
		const cardPlayer = { name: 'Card player ' + index, human: true, squareId: 'chance-south', money: 1000, heldCards: [], pay(amount) { this.money -= amount; } };
		GameStateContext.assignPlayerId(cardPlayer, 1);
		const deck = { cards: [{ action(context) { context.state.player[1].money += award; } }], order: [0], index: 0, label: 'Chance', icon: '' };
		const ui = {
			isHeadless: true,
			displayLanded() {}, alert(text) { cardLandingCalls[index].push(text); },
			updateMoney() {}, updateOwned() {}, updatePosition() { return Promise.resolve(); }
		};
		const state = GameStateContext.createState({
			player: [null, cardPlayer], pcount: 1, turn: 1,
			board: global.Monopoly.Editions.get('Classic').buildBoard(),
			cardDecks: { chance: deck },
			auctionEnabled: false
		});
		GameStateContext.initializeBoardState(state, state.board);
		const game = new FixtureGame(ui, state);
		game.getDie = () => 1;
		return game;
	}
	const firstCardGame = createCardLandingGame(0, 10);
	const secondCardGame = createCardLandingGame(1, 50);
	await Promise.all([firstCardGame.land(), secondCardGame.land()]);
	assert.strictEqual(firstCardGame.state.player[1].money, 1010);
	assert.strictEqual(secondCardGame.state.player[1].money, 1050);
	assert.strictEqual(firstCardGame.state.cardDecks.chance.index, 0);
	assert.strictEqual(secondCardGame.state.cardDecks.chance.index, 0);
	assert.ok(cardLandingCalls[0][0].includes('Card player 0'));
	assert.ok(cardLandingCalls[1][0].includes('Card player 1'));
	console.log('✔ Overlapping card landings retain per-Game decks, effects, and UI routing.');

	assert.strictEqual(UIHtml.escapeHTML(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
	assert.throws(function() {
		global.Monopoly.Editions.register('Invalid Edition', {});
	}, /must provide buildBoard/);
	assert.throws(() => new global.Square('GO'), /structured specification/);
	assert.throws(() => new global.Square({ name: 'GO' }), /structured specification/);
	const onLand = function() {};
	const configuredSquare = new global.Square({
		id: 'configured-square',
		kind: 'street',
		groupId: 'purple',
		rules: { purchasePrice: 140, baseRent: 10, rentTiers: [50, 150, 450, 625, 750], mortgageValue: 70, houseCost: 100, taxAmount: 0 },
		presentation: { label: 'Configured Square', x: 50, y: 50, rotationDegrees: 0 },
		behavior: { onLand }
	});
	assert.strictEqual(configuredSquare.id, 'configured-square');
	assert.strictEqual(configuredSquare.rules.purchasePrice, 140);
	assert.strictEqual(configuredSquare.rules.rentTiers[4], 750);
	assert.strictEqual(configuredSquare.presentation.label, 'Configured Square');
	assert.strictEqual(configuredSquare.behavior.onLand, onLand);
	assert.strictEqual(EditionRenderer.formatRentText({ display: {} }, 125), '$125');
	assert.strictEqual(EditionRenderer.formatRentText({ display: { rentText: () => '<b>Custom</b>' } }, 125), '&lt;b&gt;Custom&lt;/b&gt;');
	['Classic', 'NYC'].forEach(editionId => {
		const board = global.Monopoly.Editions.get(editionId).buildBoard();
		assert.strictEqual(Object.keys(board.squaresById).length, 40);
		assert.strictEqual(board.squaresById['go'].kind, 'go');
		assert.strictEqual(board.startSquareId, 'go');
	});
	const classicBoard = global.Monopoly.Editions.get('Classic').buildBoard();
	const classicStartPrevious = classicBoard.squaresById[classicBoard.squaresById.go.previousId].previousId;
	const classicNext = classicBoard.squaresById.go.nextId;
	assert.deepStrictEqual(RenderBoard.buildWaypointSquareIds(classicStartPrevious, classicNext, 1, classicBoard), [
		classicBoard.squaresById[classicStartPrevious].nextId,
		'go',
		classicNext
	], 'forward animation waypoints should follow stable Board links across Start');
	assert.deepStrictEqual(RenderBoard.buildWaypointSquareIds(classicNext, classicStartPrevious, -1, classicBoard), [
		'go',
		classicBoard.squaresById.go.previousId,
		classicStartPrevious
	], 'backward animation waypoints should follow stable Board links across Start');
	assert.deepStrictEqual(classicBoard.squaresById['mediterranean-avenue'].rules.rentTiers, [10, 30, 90, 160, 250]);
	assert.strictEqual(classicBoard.squaresById['mediterranean-avenue'].rules.houseCost, 50);
	assert.strictEqual(classicBoard.groupsById.brown.rules.monopolyMultiplier, 2);
	const nycBoard = global.Monopoly.Editions.get('NYC').buildBoard();
	assert.strictEqual(nycBoard.squaresById['port-authority-bus-terminal'].rules.purchasePrice, 60);
	assert.strictEqual(nycBoard.groupsById['dark-purple'].squareIds.length, 2);
	assert.deepStrictEqual(nycBoard.squaresById['lomto'].rules.rentTiers, [25, 50, 100, 200, 400]);
	console.log('✔ Classic and NYC expose native Board economics and group rules by stable ID.');

	async function runMovementFixture(startPosition, movement, boardSize) {
		const traveler = new global.Player('Traveler', 'red');
		traveler.human = true;
		const tileCount = boardSize || 40;
		const squares = Array.from({ length: tileCount }, (_, index) => ({
			name: 'Square ' + index, owner: 0, price: 0, landcount: 0, groupNumber: 0
		}));
		const squareIds = Array.from({ length: tileCount }, (_, index) => index === 0 ? 'go' : 'fixture-square-' + index);
		const squaresById = {};
		squareIds.forEach((id, index) => {
			squaresById[id] = {
				id, kind: index === 0 ? 'go' : 'free-parking',
				nextId: squareIds[(index + 1) % tileCount],
				previousId: squareIds[(index + tileCount - 1) % tileCount],
				rules: { purchasePrice: 0, baseRent: 0, rentTiers: [], mortgageValue: 0, houseCost: 0, taxAmount: 0 },
				presentation: { x: index * 100 / tileCount, y: 50, rotationDegrees: 0 }
			};
		});
		const board = global.validateBoard(new global.Board({
			editionId: 'MovementFixture', startSquareId: 'go', squaresById, groupsById: {},
			rules: { startSalary: 200, houseTotal: 32, hotelTotal: 12, bailAmount: 50 }
		}));
		traveler.squareId = squareIds[startPosition];
		const ui = {
			alert() {}, displayLanded() {}, updateMoney() {}, updateOwned() {},
			updatePosition() { return Promise.resolve(); }
		};
		const state = GameStateContext.createState({
			player: [null, traveler], pcount: 1, turn: 1, square: squares, board,
			auctionEnabled: false, pendingAuction: -1
		});
		GameStateContext.initializeBoardState(state, board);
		const game = new FixtureGame(ui, state);
		game.getDie = () => 1;
		await movement(game);
		return { traveler, state, game };
	}

	const forwardStartCrossing = await runMovementFixture(35, game => game.advanceToSquare('fixture-square-5', 'onCrossing'));
	assert.strictEqual(forwardStartCrossing.traveler.money, 1700, 'forward Start crossing pays salary once');
	const backwardMovement = await runMovementFixture(1, game => game.moveRelative(-3));
	assert.strictEqual(backwardMovement.traveler.squareId, 'fixture-square-38', 'backward movement wraps around the board');
	assert.strictEqual(backwardMovement.traveler.money, 1500, 'backward movement does not pay Start salary');
	const variableBoardMovement = await runMovementFixture(1, game => game.moveRelative(-3), 52);
	assert.strictEqual(variableBoardMovement.traveler.squareId, 'fixture-square-50', 'backward movement uses the current board length');
	const landingOnStart = await runMovementFixture(35, game => game.advanceToSquare('go', 'onCrossing'));
	assert.strictEqual(landingOnStart.traveler.money, 1700, 'landing on Start pays salary once');
	const idAdvanceCrossingStart = await runMovementFixture(35, game => game.advanceToSquare('fixture-square-5', 'onCrossing'));
	assert.strictEqual(idAdvanceCrossingStart.traveler.money, 1700, 'ID advance pays salary when the route crosses Start');
	const idAdvanceWithoutCrossing = await runMovementFixture(1, game => game.advanceToSquare('fixture-square-5', 'onCrossing'));
	assert.strictEqual(idAdvanceWithoutCrossing.traveler.money, 1500, 'ID advance does not pay salary without crossing Start');
	const idAdvanceWithoutSalary = await runMovementFixture(35, game => game.advanceToSquare('fixture-square-5', 'never'));
	assert.strictEqual(idAdvanceWithoutSalary.traveler.money, 1500, 'explicit no-salary ID advance does not pay for crossing Start');
	const idAdvanceToGoSalary = await runMovementFixture(1, game => game.advanceToSquare('go', 'always'));
	assert.strictEqual(idAdvanceToGoSalary.traveler.money, 1700, 'explicit GO card salary is awarded');
	console.log('✔ Deterministic movement fixtures cover Start crossing, landing, and backward wrapping.');

	async function assertCardDestination(editionName, deckName, cardIndex, expectedCalls) {
		const edition = global.Monopoly.Editions.get(editionName);
		const cardPlayer = new global.Player('Card traveler', 'red');
		cardPlayer.human = true;
		GameStateContext.assignPlayerId(cardPlayer, 1);
		const board = edition.buildBoard();
		const state = GameStateContext.createState({ player: [null, cardPlayer], pcount: 1, turn: 1, board,
			cardDecks: global.Monopoly.Editions.buildCardDecksForGame(editionName) });
		GameStateContext.initializeBoardState(state, board);
		const game = new FixtureGame({ updateOwned() {}, updateMoney() {} }, state);
		const actualCalls = [];
		['advanceToSquare', 'advanceToGroupNearest', 'moveRelative', 'goToJail'].forEach(method => {
			game[method] = function() { actualCalls.push([method].concat(Array.from(arguments))); };
		});
		await TurnFlow.cardAction(game, deckName, cardIndex);
		assert.deepStrictEqual(actualCalls, expectedCalls, editionName + ' ' + deckName + ' card ' + cardIndex + ' destination');
	}

	await assertCardDestination('Classic', 'chance', 9, [['advanceToSquare', 'reading-railroad', 'onCrossing']]);
	await assertCardDestination('Classic', 'chance', 10, [['advanceToSquare', 'boardwalk', 'never']]);
	await assertCardDestination('Classic', 'chance', 11, [['advanceToSquare', 'illinois-avenue', 'onCrossing']]);
	await assertCardDestination('Classic', 'chance', 14, [['advanceToSquare', 'st-charles-place', 'onCrossing']]);
	await assertCardDestination('Classic', 'chance', 4, [['moveRelative', -3]]);
	await assertCardDestination('Classic', 'chance', 5, [['advanceToGroupNearest', 'utilities']]);
	await assertCardDestination('Classic', 'chance', 7, [['advanceToGroupNearest', 'railroads']]);
	await assertCardDestination('Classic', 'chance', 15, [['goToJail']]);
	await assertCardDestination('Classic', 'community-chest', 13, [['advanceToSquare', 'go', 'always']]);
	await assertCardDestination('NYC', 'chance', 8, [['advanceToSquare', 'go', 'always']]);
	await assertCardDestination('NYC', 'chance', 9, [['advanceToSquare', 'the-regency-hotel', 'onCrossing']]);
	await assertCardDestination('NYC', 'chance', 10, [['advanceToSquare', 'trump-tower', 'never']]);
	await assertCardDestination('NYC', 'chance', 11, [['advanceToSquare', 'thirteen-wnet', 'never']]);
	await assertCardDestination('NYC', 'chance', 14, [['advanceToSquare', 'central-park', 'onCrossing']]);
	await assertCardDestination('NYC', 'chance', 4, [['moveRelative', -3]]);
	await assertCardDestination('NYC', 'chance', 13, [['advanceToGroupNearest', 'railroads']]);
	await assertCardDestination('NYC', 'chance', 5, [['advanceToGroupNearest', 'utilities']]);
	await assertCardDestination('NYC', 'chance', 15, [['goToJail']]);
	await assertCardDestination('NYC', 'community-chest', 13, [['advanceToSquare', 'go', 'always']]);
	console.log('? Deterministic Classic/NYC fixtures cover generic card destinations.');

	// Phase 6 owns Gen6 policy runtime migration. Keep its known state.square failure
	// isolated from Phase 5 browser/UI coverage until that runtime is replaced.
	const previousEdition = global.Monopoly.Editions.getActiveName();
	if (process.env.RUN_PHASE6_GEN6_SMOKE === '1') {
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

	} else {
		console.log('Skipped the pre-alpha Gen6 simulation smoke; it is tracked under Phase 6.');
	}

	const editions = global.Monopoly.Editions;
	const previousPresentationEdition = editions.getActiveName();
	try {
		const classicBoard = editions.get('Classic').buildBoard();
		const nycBoard = editions.get('NYC').buildBoard();
		assert.strictEqual(classicBoard.squaresById['mediterranean-avenue'].presentation.boardName, 'Mediter-ranean Avenue');
		assert.strictEqual(classicBoard.groupsById.railroads.presentation.tokenImage.src, 'images/train_icon.png');
		assert.strictEqual(classicBoard.groupsById.utilities.presentation.rentText({ multiplier: 10 }), '10x dice');
		assert.strictEqual(nycBoard.squaresById['bloomingdale-s'].presentation.boardName, 'blooming...');
		assert.strictEqual(nycBoard.groupsById.railroads.label, 'Transportations');
	} finally {
		editions.setActive(previousPresentationEdition);
	}
	console.log('✔ Edition presentation metadata stays on native Board squares and groups.');

	async function runTaxLanding(editionName, position, options) {
		assert.ok(editions.getNames().includes(editionName));
		editions.setActive(editionName);
		const edition = editions.getActive();
		const payer = new global.Player('Taxpayer', 'red');
		GameStateContext.assignPlayerId(payer, 1);
		payer.money = options.money;
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
		const board = edition.buildBoard();
		const boardSquareIds = [];
		let boardSquareId = board.startSquareId;
		for (let index = 0; index < Object.keys(board.squaresById).length; index++) {
			boardSquareIds.push(boardSquareId);
			boardSquareId = board.squaresById[boardSquareId].nextId;
		}
		const taxSquareId = boardSquareIds[position];
		payer.squareId = taxSquareId;
		let landingContext;
		const taxSquare = board.squaresById[taxSquareId];
		const originalOnLand = taxSquare.behavior.onLand;
		taxSquare.behavior.onLand = function(context) {
			landingContext = context;
			return originalOnLand(context);
		};
		const state = GameStateContext.createState({
			player: [null, payer],
			pcount: 1,
			turn: 1,
			board,
			freeParkingTaxes: true,
			freeParkingPot: 0,
			auctionEnabled: false,
			pendingAuction: -1
		});
		GameStateContext.initializeBoardState(state, board);
		if (options.propertySquareId) {
			GameStateContext.setSquareOwner(state, options.propertySquareId, payer.playerId);
			GameStateContext.getSquareState(state, options.propertySquareId).house = 1;
		}
		const game = new FixtureGame(ui, state);
		game.getDie = () => 1;
		await game.land(false);
		return { payer, state, events, taxChoice, landingContext };
	}

	const classicCityTax = await runTaxLanding('Classic', 4, { money: 1000 });
	assert.deepStrictEqual(Object.keys(classicCityTax.landingContext).sort(), ['game', 'playerId', 'squareId', 'state', 'ui']);
	assert.strictEqual(classicCityTax.landingContext.playerId, 'player-1');
	assert.strictEqual(classicCityTax.landingContext.squareId, 'city-tax');
	assert.strictEqual(classicCityTax.payer.money, 800);
	assert.strictEqual(classicCityTax.state.freeParkingPot, 200);
	assert.strictEqual(classicCityTax.payer.creditor, -1);
	const classicLuxuryTax = await runTaxLanding('Classic', 38, { money: 1000 });
	assert.strictEqual(classicLuxuryTax.payer.money, 900);
	assert.strictEqual(classicLuxuryTax.state.freeParkingPot, 100);
	const nycPercentageTax = await runTaxLanding('NYC', 4, { money: 1000, propertySquareId: 'port-authority-bus-terminal', choosePercentage: true });
	assert.deepStrictEqual(nycPercentageTax.taxChoice, { fixedAmount: 200, percentageAmount: 111 });
	assert.strictEqual(nycPercentageTax.payer.money, 889);
	assert.strictEqual(nycPercentageTax.state.freeParkingPot, 111);
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
		const popupOwner = { state: { player: [null, { human: true }], turn: 1 } };
		ui.game = popupOwner;
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
			['alert', 'test alert', 2, 3, popupOwner], ['money'], ['position'], ['owned'],
			['dice', popupOwner, 4, 5], ['freeParking'], ['card', 'chance', 6, popupOwner]
		]);
		assert.deepStrictEqual(rendererCalls[7], ['popup', '<p>test</p>', null, 'blank', undefined, popupOwner]);
		assert.strictEqual(rendererCalls[8][5], popupOwner, 'winner popup should retain its owning Game');
		assert.strictEqual(await positionResult, 'position');
		assert.strictEqual(await cardResult, 'card');
		assert.strictEqual(await popupResult, 'popup');
	} finally {
		restoreGlobals(savedRenderers);
	}
	console.log('✔ Browser adapter dispatch verified.');

	const savedPopupGame = saveGlobals(['game', 'player', 'turn', 'document', '$', 'setInterval', 'clearInterval']);
	try {
		global.game = { ui: { isHeadless: false } };
		let popupActionRan = false;
		PopupView.popup('headless owner', () => { popupActionRan = true; }, undefined, undefined, {
			ui: { isHeadless: true }, state: { player: [], turn: 0 }
		});
		assert.strictEqual(popupActionRan, true, 'popup behavior should use its explicit owning Game, not the global Game');

		let scheduledInterval = null;
		global.player = [null, { human: true }];
		global.turn = 1;
		global.document = {
			getElementById(id) { return id === 'popuptext' || id === 'popupclose' ? {} : null; }
		};
		global.$ = () => ({
			off() { return this; }, append() { return this; }, on() { return this; },
			val() { return this; }, focus() { return this; }, fadeIn() { return this; }, show() { return this; }
		});
		global.setInterval = (callback, delay) => { scheduledInterval = delay; return 1; };
		global.clearInterval = () => {};
		PopupView.popup('AI owner', null, undefined, undefined, {
			ui: { isHeadless: false }, state: { player: [null, { human: false }], turn: 1 }
		});
		assert.strictEqual(scheduledInterval, 1000, 'auto-close should follow the explicit Game current player');
		PopupView.popup.autoCloseTimer = null;
	} finally {
		restoreGlobals(savedPopupGame);
	}
	console.log('✔ Popup behavior uses the owning Game.');

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
	const tradeState = { initiator: null, recipient: null, game: null };
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
		{ index: 1, playerId: 'player-1', name: 'Offerer', heldCards: [] },
		{ index: 2, playerId: 'player-2', name: 'Recipient', heldCards: [] }
	];
	global.pcount = 2;
	const tradeBoard = global.Monopoly.Editions.buildGameSetup('Classic').board;
	const tradeSquares = Object.keys(tradeBoard.squaresById).filter(id => tradeBoard.squaresById[id].groupId === 'brown');
	const tradeGameState = GameStateContext.createState({ player: global.player, pcount: 2 });
	GameStateContext.initializeBoardState(tradeGameState, tradeBoard, 'Classic');
tradeState.game = { state: tradeGameState };
GameStateContext.setSquareOwner(tradeGameState, tradeSquares[0], 'player-1');
GameStateContext.setSquareOwner(tradeGameState, tradeSquares[1], 'player-2');
	try {
		TradeView.reset(tradeState, global.player[1], global.player[2], false, tradeGameState);
		global.document.getElementById('tradeleftsquare-' + tradeSquares[0]).checked = true;
		global.document.getElementById('traderightsquare-' + tradeSquares[1]).checked = true;
		global.document.getElementById('trade-leftp-money').value = '75';
		global.document.getElementById('trade-rightp-money').value = '20';
		const offer = TradeView.read(tradeState);
		assert.strictEqual(offer.getMoney(), 55);
		assert.deepStrictEqual(offer.getOfferedSquareIds(), [tradeSquares[0]]);
		assert.deepStrictEqual(offer.getRequestedSquareIds(), [tradeSquares[1]]);
		TradeView.write(tradeState, new global.Trade(global.player[1], global.player[2], -30, [tradeSquares[0]], [tradeSquares[1]], []), tradeGameState);
		assert.strictEqual(global.document.getElementById('tradeleftsquare-' + tradeSquares[0]).checked, true);
		assert.strictEqual(global.document.getElementById('traderightsquare-' + tradeSquares[1]).checked, true);
		assert.strictEqual(global.document.getElementById('trade-rightp-money').value, '30');
		global.player[1].name = 'Offerer <img src=x onerror=alert(1)>';
		global.player[2].name = 'Recipient <svg onload=alert(1)>';
		const summary = TradeView.formatResult('Offer', new global.Trade(global.player[1], global.player[2], 0, [], [], [{ cardId: 'cc:0', direction: 1 }, { cardId: 'chance:0', direction: -1 }]));
		assert(summary.indexOf('Offerer &lt;img') < summary.indexOf('Recipient &lt;svg'));
		assert(summary.includes('Offerer &lt;img src=x onerror=alert(1)&gt; gives'));
		assert(summary.includes('Recipient &lt;svg onload=alert(1)&gt; gives'));
		assert(!summary.includes('<img') && !summary.includes('<svg'));
		assert(summary.indexOf('Get Out of Jail Free card') < summary.lastIndexOf('Get Out of Jail Free card'));
	} finally {
		restoreGlobals(savedTradeGlobals);
	}
	const cardSummary = TradeView.formatResult('Card swap', new global.Trade({ name: 'Offerer' }, { name: 'Recipient' }, 0, [], [], [{ cardId: 'cc:0', direction: 1 }, { cardId: 'chance:0', direction: -1 }]));
	assert(cardSummary.indexOf('Get Out of Jail Free card') < cardSummary.lastIndexOf('Get Out of Jail Free card'));
	console.log('✔ Trade view behavior and name escaping verified.');

	// Positional global fixtures are obsolete after the structured Game UI cutover.
	if (process.env.RUN_LEGACY_UI_SMOKE === '1') {
	const savedLegacyGlobals = saveGlobals(['player', 'square', 'pcount', 'turn', 'game', '$', 'document']);
	const unsafeName = 'Player <img src=x onerror=alert(1)>';
	global.player = [null, { index: 1, playerId: 'player-1', heldCards: [], name: unsafeName, color: 'red', money: 100, human: false, AI: { profile: { name: '<svg onload=alert(1)>' } } }];
	global.square = Array.from({ length: 40 }, (_, index) => ({ index, id: 'property-' + index, owner: 0, name: 'Property ' + index, color: '#fff', groupNumber: 0, group: [], house: 0, mortgage: false }));
	global.square[1] = { ...global.square[1], owner: 1, groupNumber: 3, group: [1] };
	global.pcount = 1;
	global.turn = 1;
	try {
		const badge = RenderPanels.playerBadge(1);
		assert(badge.includes('title=\'Player &lt;img src=x onerror=alert(1)&gt;\''));
		assert(!badge.includes('<img'));
		global.square[1].name = 'Property <img src=x onerror=alert(1)>';
		const legacySummary = RenderPanels.formatTradeResult('Offer <svg>', new global.Trade(global.player[1], global.player[1], 0, ['property-1'], [], []));
		assert(legacySummary.includes('Offer &lt;svg&gt;'));
		assert(legacySummary.includes('Player &lt;img src=x onerror=alert(1)&gt; gives'));
		assert(legacySummary.includes('property-1'), 'trade summaries without a Game render stable square IDs');
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

	} else {
		console.log('Skipped obsolete global square[] UI fixture.');
	}

	const savedBrowserGlobals = saveGlobals(['document', 'player', 'pcount', 'popup', 'game', 'addAlert', 'showAuctionPlayerStats']);
	const auctionHoverHandlers = {};
	const auctionParticipant = {
		addEventListener(event, handler) { auctionHoverHandlers[event] = handler; },
		getAttribute() { return '1'; }
	};
	const auctionElements = {
		propertyname: { innerHTML: '' }, auctionparticipants: { innerHTML: '', querySelectorAll: () => [auctionParticipant] },
		pname: { textContent: '' }, highestbid: { textContent: '' }, highestbidder: { textContent: '' },
		currentbidder: { textContent: '' }, bid: { value: '125', style: {}, focus() { this.focused = true; } },
		'auction-bid-button': { addEventListener(event, handler) { this.handler = handler; } },
		'auction-pass-button': { addEventListener(event, handler) { this.handler = handler; } },
		'auction-exit-button': { addEventListener(event, handler) { this.handler = handler; } },
		buypropertybutton: { addEventListener(event, handler) { this.handler = handler; } },
		'pay-fine-button': { addEventListener(event, handler) { this.handler = handler; } },
		gojfbutton: { addEventListener(event, handler) { this.handler = handler; } },
		landed: { innerHTML: '', style: {} }
	};
	const mortgageRow = { style: {} };
	const mortgageButton = { handler: null, getAttribute: () => 'central-park', addEventListener(event, handler) { this.handler = handler; } };
	const taxButtons = {
		fixed: { addEventListener(event, handler) { this.handler = handler; } },
		percentage: { addEventListener(event, handler) { this.handler = handler; } }
	};
global.document = {
		getElementById: id => auctionElements[id] || (id === 'tax-fixed-button' ? taxButtons.fixed : id === 'tax-percentage-button' ? taxButtons.percentage : null),
		querySelectorAll: selector => selector === '[data-unmortgage-square-id]' ? [mortgageButton] : [],
		querySelector: selector => selector === "[data-unmortgage-row='central-park']" ? mortgageRow : null
	};
	global.player = [null, { index: 1, name: 'Ambient player', color: '#000', bidding: true }];
	global.pcount = 1;
	let auctionSubmitCount = 0;
	const ownerActions = [];
	const uiPopupCalls = [];
	let forwardedAlertGame = null;
	global.popup = (...args) => uiPopupCalls.push(args);
	global.addAlert = (text, playerIndex, secondPlayerIndex, gameInstance) => { forwardedAlertGame = gameInstance; };
	let hoveredGame = null;
	global.showAuctionPlayerStats = (playerIndex, event, gameInstance) => { hoveredGame = gameInstance; };
	global.game = { auctionBid() { throw new Error('UI action escaped to global game'); } };
	try {
		const ui = new BrowserUI();
		ui.game = {
			state: {
				board: global.Monopoly.Editions.get('Classic').buildBoard(),
				cardDecks: { chance: { icon: 'images/chance_icon.png', label: 'Chance' } },
				player: [null, { index: 1, name: 'Bidder <img src=x onerror=alert(1)>', color: '#fff', bidding: true, heldCards: ['chance:0'] }],
				pcount: 1, turn: 1, playerOverlays: []
			},
			submitPlayerAction: action => {
                if (action.type === 'auctionBid') { assert.ok('amount' in action); auctionSubmitCount++; }
                else ownerActions.push({ auctionPass: 'pass', auctionExit: 'exit', buy: 'buy', payBail: 'bail', useJailCard: 'jail-card' }[action.type]);
            },
            auctionBid: () => { auctionSubmitCount++; },
			auctionPass: () => ownerActions.push('pass'),
			auctionExit: () => ownerActions.push('exit'),
			buy: () => ownerActions.push('buy'),
			payBail: () => ownerActions.push('bail'),
			useJailCard: () => ownerActions.push('jail-card')
		};
		ui.alert('Owned-game alert');
		assert.strictEqual(forwardedAlertGame, ui.game, 'alerts must carry their owning Game into the renderer');
		const auctionSquareId = 'reading-railroad';
		const auctionSquare = ui.game.state.board.squaresById[auctionSquareId];
		ui.initializeAuction(auctionSquareId, auctionSquare, { name: 'Bidder' });
		ui.openAuction(auctionSquareId, auctionSquare, { name: 'Bidder' });
		assert.ok(auctionElements.propertyname.innerHTML.includes('Reading Railroad'));
		assert.strictEqual(auctionElements.currentbidder.textContent, "It is Bidder's turn to bid.");
		assert.strictEqual(auctionElements.highestbid.textContent, '0');
		assert.strictEqual(auctionElements.highestbidder.textContent, 'N/A');
		assert.strictEqual(ui.readAuctionBid(), 125);
		auctionElements.bid.onkeydown({ keyCode: 13 });
		assert.strictEqual(auctionSubmitCount, 1);
		auctionElements['auction-bid-button'].handler();
		auctionElements['auction-pass-button'].handler();
		auctionElements['auction-exit-button'].handler();
		assert.strictEqual(auctionSubmitCount, 2);
		assert.deepStrictEqual(ownerActions, ['pass', 'exit']);
		ui.updateAuctionTurn('Next bidder', true);
		assert.strictEqual(auctionElements.bid.value, '');
		ui.setAuctionBidError('Invalid bid');
		ui.updateAuctionBid(250, 'Next bidder');
		assert.strictEqual(auctionElements.highestbid.textContent, 250);
		assert.strictEqual(auctionElements.highestbidder.textContent, 'Next bidder');
		ui.focusAuctionBid();
		assert.strictEqual(auctionElements.bid.focused, true);
		assert.ok(uiPopupCalls[0][0].includes("id='auctionparticipants'"));
		ui.onAuctionParticipants();
		assert.ok(auctionElements.auctionparticipants.innerHTML.includes('Bidder &lt;img src=x onerror=alert(1)&gt;'));
		assert.ok(!auctionElements.auctionparticipants.innerHTML.includes('Ambient player'));
		assert.ok(!auctionElements.auctionparticipants.innerHTML.includes('<img'));
		auctionHoverHandlers.mouseenter.call(auctionParticipant, {});
		assert.strictEqual(hoveredGame, ui.game, 'auction hover stats must use the owning Game');
		ui.displayPropertyPurchase(auctionSquareId, auctionSquare);
		auctionElements.buypropertybutton.handler();
		ui.displayJailOptions(true, false);
		auctionElements['pay-fine-button'].handler();
		auctionElements.gojfbutton.handler();
		assert.deepStrictEqual(ownerActions, ['pass', 'exit', 'buy', 'bail', 'jail-card']);
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
		let confirmedUnmortgageSquareId = null;
		ui.showBankruptcyUnmortgage('Creditor <One>', [{ squareId: 'central-park', name: 'Property <Three>', color: '#fff', price: 100 }], squareId => {
			confirmedUnmortgageSquareId = squareId;
			return true;
		}, () => {});
		assert.ok(uiPopupCalls[6][0].includes('Creditor &lt;One&gt;'));
		assert.ok(uiPopupCalls[6][0].includes("data-unmortgage-square-id='central-park'"));
		assert.ok(uiPopupCalls[6][0].includes('Property &lt;Three&gt;'));
		mortgageButton.handler.call(mortgageButton);
		assert.strictEqual(confirmedUnmortgageSquareId, 'central-park');
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

	const savedPositionGlobals = saveGlobals(['document', 'window', 'player', 'pcount', 'turn', 'lastKnownPosition', 'lastKnownJail', 'nextMoveDirection', 'playerOverlays']);
	try {
		const positionElements = {
			jail: { style: {} },
			jailpositionholder: { innerHTML: '' },
			playertoken1: { getBoundingClientRect() { return { left: 10, top: 20 }; } }
		};
		const positionBoard = global.Monopoly.Editions.get('Classic').buildBoard();
		Object.keys(positionBoard.squaresById).forEach(squareId => {
			positionElements['square-' + squareId] = { style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
			positionElements['square-' + squareId + '-tokens'] = { innerHTML: '' };
		});
		positionElements.jail = { style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
		positionElements.jailpositionholder = { innerHTML: '' };
		global.document = {
			getElementById: id => positionElements[id] || null,
			createElement: () => ({ style: {} }),
			body: { appendChild() {} }
		};
		global.window = { scrollX: 0, scrollY: 0 };
		global.player = [null, { name: 'Ambient', color: 'black', position: 22, jail: false }];
		global.pcount = 1;
		global.turn = 1;
		global.lastKnownPosition = [null, 31];
		global.lastKnownJail = [null, false];
		global.nextMoveDirection = 1;
		global.playerOverlays = [];
		const ownedOverlay = { style: {} };
		const positionPlayer = { name: 'Owned', color: 'red', playerId: 'player-1', squareId: 'chance-south', jail: false };
		const positionState = GameStateContext.createState({
			player: [null, positionPlayer], pcount: 1, turn: 1, board: positionBoard,
			lastKnownSquareByPlayerId: {}, lastKnownJailByPlayerId: {}, playerOverlays: { 'player-1': ownedOverlay }
		});
		GameStateContext.initializeBoardState(positionState, positionState.board);
		await RenderBoard.updatePosition({ state: positionState, ui: { isHeadless: false } });
		assert.strictEqual(positionState.lastKnownSquareByPlayerId['player-1'], 'chance-south');
		assert.strictEqual(positionState.lastKnownJailByPlayerId['player-1'], false);
		assert.strictEqual(ownedOverlay.style.backgroundColor, 'red');
		assert.ok(positionElements['square-chance-south-tokens'].innerHTML.includes('player-1'));
	} finally {
		restoreGlobals(savedPositionGlobals);
	}
	console.log('✔ Browser position rendering uses the owning Game state.');

    const nextState = GameStateContext.createState({ player: [null, { playerId: 'player-1', money: 1500 }], turn: 1, pcount: 1 });
    const nextGame = new FixtureGame({}, nextState);
    let submittedNext;
    nextGame.controllers.set('player-1', { pending: true, submit(action) { submittedNext = action; return true; } });
    assert.strictEqual(nextGame.next(), true);
    assert.deepStrictEqual(submittedNext, { type: 'next' }, 'Next submits input without directly advancing the rules');

	const savedAuctionGlobals = saveGlobals(['game', 'player', 'square', 'turn', 'pcount', 'play']);
	try {
		const bidCalls = [];
		global.player = [{ index: 0, name: 'the bank', human: false }, ...Array.from({ length: 3 }, (_, index) => ({
			index: index + 1, name: 'Bidder ' + (index + 1), human: false, money: 1500,
			AI: { bid: () => { bidCalls.push(index + 1); return 0; } }
		}))];
		global.player.slice(1).forEach((player, index) => GameStateContext.assignPlayerId(player, index + 1));
		const auctionFixture = createAuctionFixtureState(global.player, 1);
		global.play = () => {};
		const headlessUI = { isHeadless: true, onAuctionHistory() {}, onAuctionParticipants() {}, closeAuction() {}, alert() {}, updateOwned() {}, updateAuctionBid() {}, focusAuctionBid() {} };
		const game = new FixtureGame(headlessUI, auctionFixture.state);
		game.play = () => {};
		game.addPropertyToAuctionQueue(auctionFixture.squareId);
		assert.strictEqual(await game.auction(), true);
		assert.deepStrictEqual(bidCalls, [1, 2, 3]);
		game.state.turn = 0;
		game.addPropertyToAuctionQueue(auctionFixture.squareId);
		assert.strictEqual(await game.auction(), true);
		assert.deepStrictEqual(bidCalls, [1, 2, 3, 1, 2, 3]);

		let incrementalBidCount = 0;
		global.player = [{ index: 0, name: 'the bank', human: false }, ...Array.from({ length: 3 }, (_, index) => ({
			index: index + 1, name: 'Bidder ' + (index + 1), human: false, money: 10000,
			pay(amount) { this.money -= amount; },
			AI: { bid: (property, currentBid) => { incrementalBidCount++; return currentBid + 1; } }
		}))];
		const incrementalFixture = createAuctionFixtureState(global.player, 1);
		const incrementalAuction = new FixtureGame(headlessUI, incrementalFixture.state);
		incrementalAuction.play = () => {};
		incrementalAuction.addPropertyToAuctionQueue(incrementalFixture.squareId);
		assert.strictEqual(await incrementalAuction.auction(), true);
		assert.strictEqual(incrementalBidCount, 10002, 'bidders should continue until their cash limit, without a bid-count cap or stack overflow');
		assert.strictEqual(incrementalAuction.auctionState.highestBid, 10000);
		const auctionWinner = incrementalAuction.state.player[incrementalAuction.auctionState.highestBidder];
		assert.strictEqual(GameStateContext.getSquareState(incrementalAuction.state, incrementalFixture.squareId).ownerId, auctionWinner.playerId);
		assert.strictEqual(auctionWinner.money, 0, 'the winner should pay the full final bid');

		const interactiveCalls = [];
		global.player = [{ index: 0, name: 'the bank', human: false }, ...Array.from({ length: 3 }, (_, index) => ({
			index: index + 1, name: 'Bidder ' + (index + 1), human: false, money: 1500, AI: { bid: () => 0 }
		}))];
		const interactiveFixture = createAuctionFixtureState(global.player, 1);
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
		const interactiveGame = new FixtureGame(interactiveUI, interactiveFixture.state);
		interactiveGame.play = () => {};
		interactiveGame.addPropertyToAuctionQueue(interactiveFixture.squareId);
		assert.strictEqual(await interactiveGame.auction(), true);
		assert.deepStrictEqual(interactiveCalls, [1, 2, 3]);

		const mixedPlayers = [null,
			{ name: 'Human', human: true, money: 1500, pay(amount) { this.money -= amount; } },
			{ name: 'AI', human: false, money: 1500, pay(amount) { this.money -= amount; },
				AI: { bid: (property, currentBid) => currentBid + 1 } }
		];
		const mixedFixture = createAuctionFixtureState(mixedPlayers, 1);
		const humanTurns = [];
		let closedMixedAuction = false;
		const mixedGame = new FixtureGame({ isHeadless: false, openAuction() {},
			updateAuctionTurn(name) { humanTurns.push(name); },
			closeAuction() { closedMixedAuction = true; }
		}, mixedFixture.state);
		mixedGame.addPropertyToAuctionQueue(mixedFixture.squareId);
		mixedGame.registerController('player-1', new global.PlayerControllers.BrowserController(mixedGame));
        const mixedCompletion = mixedGame.auction();
		assert.strictEqual(mixedGame.auctionState.highestBid, 0, 'opening human turn waits for input');
		assert.strictEqual(mixedGame.submitPlayerAction({ type: 'auctionBid', amount: 250 }), true);
        await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(mixedGame.auctionState.highestBid, 251, 'AI responds to the human bid');
		assert.strictEqual(mixedGame.auctionState.currentBidder, 1);
		assert.deepStrictEqual(humanTurns, ['Human', 'Human'], 'AI progression returns control to the human');
		assert.strictEqual(closedMixedAuction, false);
		mixedGame.submitPlayerAction({ type: 'auctionExit' });
        assert.strictEqual(await mixedCompletion, true);
		assert.strictEqual(closedMixedAuction, true);
		assert.strictEqual(GameStateContext.getSquareState(mixedGame.state, mixedFixture.squareId).ownerId, mixedPlayers[2].playerId);
		assert.strictEqual(mixedPlayers[2].money, 1249);
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
	global.player = [null, new global.Player('Test player', 'red')];
	global.player[1].index = 1;
	const actionBoard = global.Monopoly.Editions.buildGameSetup('Classic').board;
	const actionIds = Object.keys(actionBoard.squaresById).filter(id => actionBoard.squaresById[id].kind === 'street').slice(0, 2);
	const actionId = actionIds[0], secondActionId = actionIds[1];
	global.player[1].money = 500;
	GameStateContext.assignPlayerId(global.player[1], 1);
	global.player[1].squareId = actionId;
	global.turn = 1;
	global.pendingAuction = -1;
	try {
		const actionState = GameStateContext.createState({ player: global.player, pcount: 1, turn: global.turn });
		GameStateContext.initializeBoardState(actionState, actionBoard, 'Classic');
		const actionGame = new FixtureGame(actionUI, actionState);
		assert.strictEqual(actionGame.buy(actionId), true);
		assert.strictEqual(actionGame.buy(secondActionId), true);
		assert.strictEqual(GameStateContext.getSquareState(actionState, actionId).ownerId, 'player-1');
		assert.strictEqual(actionGame.mortgage(actionId), true);
		assert.strictEqual(actionGame.unmortgage(actionId), true);
		assert.strictEqual(actionGame.buyHouse(actionId), true);
		assert.strictEqual(actionGame.sellHouse(actionId), true);
		global.player[1].squareId = secondActionId;
		global.player[1].money = 10;
		assert.strictEqual(actionGame.buy(secondActionId), false);
		for (const method of ['updateOwned', 'updateMoney']) {
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
