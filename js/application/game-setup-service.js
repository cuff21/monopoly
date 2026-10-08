(function(global) {
	'use strict';

	var dependencies = {};

	function configure(options) {
		dependencies = options || {};
	}

	function createPlayers(configuration, playerSlots) {
		var availableSlots = playerSlots.slice();
		for (var i = availableSlots.length - 1; i > 0; i--) {
			var swapIndex = Math.floor(Math.random() * (i + 1));
			var current = availableSlots[i];
			availableSlots[i] = availableSlots[swapIndex];
			availableSlots[swapIndex] = current;
		}

		var playersGame = [];
		configuration.players.forEach(function(selection, index) {
			var currentPlayer = availableSlots[index];
			var registration = (dependencies.aiRegistry || global.AISetupRegistry).get(selection.ai);
			currentPlayer.color = selection.color.toLowerCase();
			currentPlayer.human = selection.ai === '0';
			if (currentPlayer.human) {
				currentPlayer.name = selection.name;
				return;
			}

			if (!registration) throw new Error('No AI setup registration exists for id: ' + selection.ai);
			currentPlayer.AI = registration.createPlayer(currentPlayer, selection);

			if (registration.trackResults) playersGame.push(currentPlayer);
			var colorName = currentPlayer.color.charAt(0).toUpperCase() + currentPlayer.color.slice(1);
			currentPlayer.name = colorName + ' Bot';
		});

		return playersGame;
	}

	// `control` receives stop() and getWorkerStats() for the duration of the run.
	async function trainGen6(generations, onProgress, onStatus, control) {
		var trainerType = dependencies.gen6Trainer;
		if (!trainerType) throw new Error('Gen6 training is unavailable.');

		var workerPool = null;
		var trainer = null;
		if (control) {
			control.stopRequested = false;
			control.getWorkerStats = function() {
				return workerPool && workerPool.getStats
					? workerPool.getStats()
					: { workers: 1, active: 1, queued: 0 };
			};
			control.stop = function() {
				control.stopRequested = true;
				if (trainer && trainer.stop) trainer.stop();
				if (workerPool) workerPool.terminate();
			};
		}
		try {
			try {
				workerPool = dependencies.createWorkerPool ? dependencies.createWorkerPool() : null;
			} catch (workerError) {
				workerPool = null;
				if (onStatus) onStatus('Workers unavailable; training on main thread.');
			}
			if (onStatus) onStatus(workerPool
				? 'Training with ' + workerPool.slots.length + ' workers...'
				: 'Training on main thread...');
			trainer = trainerType.loadOrCreate({
				populationSize: trainerType.DEFAULT_POPULATION_SIZE,
				turnsPerMatch: trainerType.DEFAULT_TURNS_PER_MATCH,
				matchRunner: workerPool ? workerPool.runMatch.bind(workerPool) : null
			});
			if (control && control.stopRequested) return { stopped: true, population: trainer.population, validation: null };
			return await trainer.train(generations, onProgress);
		} finally {
			if (workerPool) workerPool.terminate();
		}
	}

	var service = {
		configure: configure,
		createPlayers: createPlayers,
		trainGen6: trainGen6
	};
	global.GameSetupService = service;
	if (typeof module !== 'undefined' && module.exports) module.exports = service;
})(typeof window !== 'undefined' ? window : globalThis);