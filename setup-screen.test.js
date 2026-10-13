const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AISetupRegistry = require('./js/application/ai-setup-registry');
const GameSetupService = require('./js/application/game-setup-service');
const ApplicationScriptManifest = require('./js/script-manifest');
const SetupScreen = require('./js/ui/setup-screen');
const TrainingScreen = require('./js/ui/training-screen');

async function runTests() {
	ApplicationScriptManifest.scripts.filter(script => script.page).forEach(script => {
		assert.ok(fs.existsSync(path.join(__dirname, 'js', script.src)), 'page script should exist: ' + script.src);
	});
	assert.strictEqual(global.StrategicAI, undefined, 'setup tests should not load AI implementations');
	assert.strictEqual(global.Gen6Trainer, undefined, 'setup tests should not load the Gen6 trainer');

	const values = {
		auctionenabled: { checked: true },
		freeparkingtaxes: { checked: false },
		player1ai: { value: '0' },
		player1color: { value: 'RED' },
		player1name: { value: 'Human' },
		player1aiProfile: { value: 'Random' },
		player2ai: { value: '6' },
		player2color: { value: 'blue' },
		player2name: { value: 'Bot' },
		player2aiProfile: { value: 'Random' }
	};
	global.pcount = 2;
	global.document = { getElementById: id => values[id] };
	assert.deepStrictEqual(SetupScreen.collectSetupConfiguration({ game: { state: { pcount: 2 } } }), {
		auctionEnabled: true,
		freeParkingTaxes: false,
		players: [
			{ ai: '0', color: 'RED', name: 'Human', profile: 'Random' },
			{ ai: '6', color: 'blue', name: 'Bot', profile: 'Random' }
		]
	});
	class FixtureAI {
		constructor(player, profile) {
			this.player = player;
			this.profile = profile;
		}
		static getRandomProfile() { return { name: 'Balanced' }; }
	}
	AISetupRegistry.register({
		id: '4',
		label: 'Strategic AI',
		profiles: ['Balanced', 'Defensive'],
		createPlayer: (player, selection) => new FixtureAI(player, { name: selection.profile })
	});
	AISetupRegistry.register({
		id: '6',
		label: 'Gen6 AI',
		defaultPriority: 6,
		createPlayer: player => new FixtureAI(player)
	});
	AISetupRegistry.register({
		id: '7',
		label: 'Future AI',
		defaultPriority: 7,
		createPlayer: player => new FixtureAI(player)
	});
	GameSetupService.configure({
		aiRegistry: AISetupRegistry
	});
	const setupControllers = new Map();
	const seededGame = { registerController(id, controller) { setupControllers.set(id, controller); }, state: { random: () => 0.999, board: { squaresById: {} } } };
	const composedPlayers = [{ playerId: 'player-1', game: seededGame }, { playerId: 'player-2', game: seededGame }];
	GameSetupService.createPlayers({ players: [
			{ ai: '0', color: 'RED', name: 'Human', profile: 'Random' },
			{ ai: '4', color: 'blue', name: 'Bot', profile: 'Balanced' }
		] }, composedPlayers);
	assert.strictEqual(composedPlayers[0].name, 'Human');
	assert.strictEqual(composedPlayers[0].human, true);
	assert.strictEqual(composedPlayers[1].AI instanceof FixtureAI, true);
	assert.deepStrictEqual(composedPlayers[1].AI.profile, { name: 'Balanced' });
	assert.deepStrictEqual(AISetupRegistry.getProfiles('4'), ['Balanced', 'Defensive']);

	const playerInputContainer = { children: [], appendChild(child) { this.children.push(child); } };
	global.Option = function(label, value) { this.label = label; this.value = value; this.style = {}; };
	global.document = {
		getElementById: id => id === 'player-inputs' ? playerInputContainer : null,
		createElement: () => ({
			children: [],
			style: {},
			appendChild(child) { this.children.push(child); },
			addEventListener() {}
		})
	};
	SetupScreen.createPlayerInputs();
	const secondPlayerAI = playerInputContainer.children[1].children[1];
	assert.deepStrictEqual(secondPlayerAI.children.map(option => option.value), ['0', '4', '6', '7']);
	assert.strictEqual(secondPlayerAI.children[3].selected, true, 'new players should use the highest-priority registered model');

	const poolEvents = [];
	const trainingProgress = [];
	const trainingStatuses = [];
	GameSetupService.configure({
		gen6Trainer: {
			DEFAULT_POPULATION_SIZE: 32,
			DEFAULT_TURNS_PER_MATCH: 100,
			loadOrCreate(options) {
				assert.strictEqual(options.populationSize, 32);
				assert.strictEqual(options.turnsPerMatch, 100);
				assert.strictEqual(typeof options.matchRunner, 'function');
				return {
					async train(generations, onProgress) {
						assert.strictEqual(generations, 2);
						onProgress({ phase: 'tournament', generation: 1, generationsCompleted: 0, generationsRequested: 2, round: 1, matchesCompleted: 3, matchCount: 8, edition: 'Classic', playerCount: 4 });
						onProgress({ generation: 1, generationsCompleted: 1, generationsRequested: 2, bestScore: 10, tournament: { edition: 'Classic', playerCount: 4, topScore: 10, rounds: [{}, {}] } });
						return {
							population: { generation: 2 },
							validation: { improvementPercentagePoints: 1, lower95ConfidenceBound: -1, passed: false }
						};
					}
				};
			}
		},
		createWorkerPool() {
			return {
				slots: [{}, {}],
				runMatch() {},
				terminate() { poolEvents.push('terminated'); }
			};
		}
	});

	const elements = {};
	const resultRows = [];
	global.document = {
		getElementById: id => elements[id] || (elements[id] = { id, disabled: false, textContent: '', value: '2', style: {}, innerHTML: '', insertBefore: row => resultRows.push(row) }),
		createElement: () => ({ children: [], appendChild(child) { this.children.push(child); } })
	};
	global.GameSetupService = {
		trainGen6: async (generations, onProgress, onStatus, control) => {
			const result = await GameSetupService.trainGen6(generations, onProgress, message => {
				trainingStatuses.push(message);
				if (onStatus) onStatus(message);
			}, control);
			trainingProgress.push(elements['gen6-training-status'].textContent);
			return result;
		}
	};
	await TrainingScreen.trainGen6Population();
	assert.deepStrictEqual(poolEvents, ['terminated'], 'training service should always terminate its worker pool');
	assert.deepStrictEqual(trainingStatuses, ['Training with 2 workers...']);
	assert.deepStrictEqual(trainingProgress, ['Generation 1 | Best score 10']);
	assert.strictEqual(elements['training-match-text'].textContent, '3/8');
	assert.strictEqual(resultRows.length, 1, 'each finished generation should add a tournament result row');
	assert.match(elements['gen6-training-status'].textContent, /CANDIDATE NOT PROMOTED/);
	assert.strictEqual(elements['train-gen6-button'].disabled, false);
	assert.strictEqual(elements['stop-training-button'].disabled, true);

	poolEvents.length = 0;
	let stopTrainer;
	GameSetupService.configure({
		gen6Trainer: {
			DEFAULT_POPULATION_SIZE: 32,
			DEFAULT_TURNS_PER_MATCH: 100,
			loadOrCreate() {
				let release;
				const released = new Promise(resolve => { release = resolve; });
				stopTrainer = {
					population: { generation: 0 },
					stop() { release(); },
					async train() {
						await released;
						return { stopped: true, population: this.population, validation: null };
					}
				};
				return stopTrainer;
			}
		},
		createWorkerPool() {
			return {
				slots: [{}, {}],
				runMatch() {},
				getStats: () => ({ workers: 2, active: 2, queued: 5 }),
				terminate() { poolEvents.push('terminated'); }
			};
		}
	});
	const running = TrainingScreen.trainGen6Population();
	await new Promise(resolve => setTimeout(resolve, 0));
	assert.strictEqual(elements['stop-training-button'].disabled, false, 'stop should be available while training');
	TrainingScreen.stopTraining();
	await running;
	assert.deepStrictEqual(poolEvents, ['terminated']);
	assert.strictEqual(elements['gen6-training-status'].textContent, 'Training stopped.');
	assert.strictEqual(elements['train-gen6-button'].disabled, false);

	delete global.GameSetupService;
	delete global.document;
	delete global.Option;
	delete global.pcount;
	console.log('Setup screen collects declarative choices and delegates Gen6 training.');
}

runTests().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
