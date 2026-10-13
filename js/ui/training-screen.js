(function(global) {
'use strict';
// AI training screen: starts/stops Gen6 training and displays live progress.

var trainingControl = null;
var trainingPollTimer = null;

function trainingElement(id) {
	return document.getElementById(id);
}

function setTrainingText(id, text) {
	var element = trainingElement(id);
	if (element) element.textContent = text;
}

function getTrainingService() {
	return global.SetupScreen.getSetupService();
}

function showTrainingScreen() {
	trainingElement("setup").style.display = "none";
	trainingElement("training").style.display = "block";
}

function hideTrainingScreen() {
	if (trainingControl) return;
	trainingElement("training").style.display = "none";
	trainingElement("setup").style.display = "block";
}

function updateTrainingThreads() {
	var stats = trainingControl && trainingControl.getWorkerStats
		? trainingControl.getWorkerStats()
		: { workers: 0, active: 0, queued: 0 };
	setTrainingText("training-threads-active", stats.active);
	setTrainingText("training-threads-total", stats.workers);
	setTrainingText("training-queued", stats.queued);
}

function addTrainingResultRow(update) {
	var body = trainingElement("training-results-body");
	if (!body) return;
	var tournament = update.tournament || {};
	var row = document.createElement("tr");
	[
		update.generation,
		tournament.edition || "-",
		tournament.playerCount || "-",
		(tournament.rounds || []).length,
		tournament.topScore,
		update.bestScore
	].forEach(function(value) {
		var cell = document.createElement("td");
		cell.textContent = value;
		row.appendChild(cell);
	});
	body.insertBefore(row, body.firstChild);
}

function applyTrainingProgress(update) {
	if (update.phase === "validation") {
		setTrainingText("training-validation", update.gamesCompleted + "/" + update.gamesRequested + " games");
		setTrainingText("gen6-training-status", "Held-out validation " + update.gamesCompleted + "/" + update.gamesRequested + " games...");
		return;
	}

	setTrainingText("training-generations-requested", update.generationsRequested);
	if (update.phase === "tournament") {
		setTrainingText("training-generation", update.generation);
		setTrainingText("training-generations-done", update.generationsCompleted);
		setTrainingText("training-round", "Round " + update.round);
		setTrainingText("training-setup", update.edition + ", " + update.playerCount + " players per match");
		setTrainingText("training-match-text", update.matchesCompleted + "/" + update.matchCount);
		var progress = trainingElement("training-match-progress");
		if (progress) {
			progress.max = update.matchCount;
			progress.value = update.matchesCompleted;
		}
		setTrainingText("gen6-training-status", "Generation " + update.generation + " | Round " + update.round + " | Match " + update.matchesCompleted + "/" + update.matchCount);
		return;
	}

	setTrainingText("training-generation", update.generation);
	setTrainingText("training-generations-done", update.generationsCompleted);
	setTrainingText("training-best-score", update.bestScore);
	addTrainingResultRow(update);
	setTrainingText("gen6-training-status", "Generation " + update.generation + " | Best score " + update.bestScore);
}

function setTrainingRunning(running) {
	trainingElement("train-gen6-button").disabled = running;
	trainingElement("stop-training-button").disabled = !running;
	trainingElement("training-back-button").disabled = running;
	trainingElement("gen6-generations").disabled = running;
}

async function trainGen6Population() {
	var service = getTrainingService();
	var status = trainingElement("gen6-training-status");
	var generations = parseInt(trainingElement("gen6-generations").value, 10);
	if (!status || !service || trainingControl) return;

	var control = {};
	trainingControl = control;
	setTrainingRunning(true);
	trainingElement("training-results-body").innerHTML = "";
	setTrainingText("training-validation", "-");
	status.textContent = "Preparing training...";
	trainingPollTimer = setInterval(updateTrainingThreads, 250);
	try {
		var result = await service.trainGen6(generations, applyTrainingProgress, function(message) {
			status.textContent = message;
		}, control);
		if (result.stopped) {
			status.textContent = "Training stopped.";
			return;
		}
		var validation = result.validation;
		status.textContent = "Saved generation " + result.population.generation + " | Held-out improvement " +
			validation.improvementPercentagePoints.toFixed(1) + " pp (95% lower bound " +
			validation.lower95ConfidenceBound.toFixed(1) + ") | " +
			(validation.passed ? "CHAMPION APPROVED" : "CANDIDATE NOT PROMOTED");
	} catch (error) {
		status.textContent = control.stopRequested ? "Training stopped." : error.message;
	} finally {
		clearInterval(trainingPollTimer);
		trainingPollTimer = null;
		trainingControl = null;
		updateTrainingThreads();
		setTrainingRunning(false);
	}
}

function stopTraining() {
	if (!trainingControl || !trainingControl.stop) return;
	trainingElement("gen6-training-status").textContent = "Stopping...";
	trainingElement("stop-training-button").disabled = true;
	trainingControl.stop();
}

var api = { trainGen6Population: trainGen6Population, stopTraining: stopTraining, showTrainingScreen: showTrainingScreen, hideTrainingScreen: hideTrainingScreen };
global.TrainingScreen = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
