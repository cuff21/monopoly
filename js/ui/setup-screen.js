(function(global) {
'use strict';
var DOMUI = (typeof globalThis !== 'undefined' && globalThis.DOMUI) ||
	(typeof module !== 'undefined' && module.exports ? require('./dom') : null);

// Player setup screen: building player config rows and starting/restarting a game.

var setupService = null;
var setupRegistry = null;

function getSetupService() {
	return setupService || (typeof GameSetupService !== 'undefined' ? GameSetupService : null);
}

function setSetupService(service) {
	setupService = service;
}

function getAISetupRegistry() {
	return setupRegistry || (typeof AISetupRegistry !== 'undefined' ? AISetupRegistry : null);
}

function setAISetupRegistry(registry) {
	setupRegistry = registry;
}

function collectSetupConfiguration(app) {
	var configuration = {
		auctionEnabled: document.getElementById("auctionenabled").checked,
		freeParkingTaxes: document.getElementById("freeparkingtaxes").checked,
		players: []
	};
	for (var i = 1; i <= app.game.state.pcount; i++) {
		configuration.players.push({
			ai: document.getElementById("player" + i + "ai").value,
			color: document.getElementById("player" + i + "color").value,
			name: document.getElementById("player" + i + "name").value,
			profile: document.getElementById("player" + i + "aiProfile").value
		});
	}
	return configuration;
}

function setup(app) {
	app.game.state.lastGamePlayerCount = app.game.state.pcount;
	ensureUniqueHumanNames(app);
	var configuration = collectSetupConfiguration(app);
	app.game.state.auctionEnabled = configuration.auctionEnabled;
	app.game.state.freeParkingTaxes = configuration.freeParkingTaxes;
	app.game.state.freeParkingPot = 0;
	app.game.ui.updateFreeParking();
	app.game.state.pendingAuction = null;
    app.game.state.playersGame = [];
    
    const els = document.querySelectorAll('.mortgaged');
    for(const el of els) {
        el.classList.remove('mortgaged');
    }

	app.game.state.playersGame = getSetupService().createPlayers(configuration, app.game.state.player.slice(1, app.game.state.pcount + 1));

	DOMUI.setVisible("#board, #moneybar", true);
	RenderBoard.setTokenOverlaysVisible(true, app.game);
	DOMUI.setVisible("#setup", false);
	DOMUI.setVisible("#refresh", false);

	if (app.game.state.pcount === 2) {
		document.getElementById("stats").style.width = "454px";
	} else if (app.game.state.pcount === 3) {
		document.getElementById("stats").style.width = "686px";
	}

	document.getElementById("stats").style.top = "0px";
	document.getElementById("stats").style.left = "0px";
	console.log("Starting the game!");
    var game = app.game;
    game.onGameError = function(error) { game.ui.showMessage('Game stopped: ' + error.message, undefined, undefined, 0); };
    Promise.resolve(game.play()).catch(function() { /* onGameError presents the failure. */ });
}

function restartGame(app) {
	var settings = {
		auctionEnabled: document.getElementById("auctionenabled").checked,
		freeParkingTaxes: document.getElementById("freeparkingtaxes").checked,
		players: []
	};

	for (var i = 1; i <= 8; i++) {
		settings.players.push({
			ai: document.getElementById("player" + i + "ai").value,
			color: document.getElementById("player" + i + "color").value,
			name: document.getElementById("player" + i + "name").value,
			profile: document.getElementById("player" + i + "aiProfile").value
		});
	}

	var playerCount = app.game.state.lastGamePlayerCount;
	app.game.ui.popupView.close();
	DOMUI.setVisible("#popupwrap, #popupbackground", false);
	document.getElementById("player-inputs").innerHTML = "";
	document.getElementById('alert').replaceChildren();
	app.mount();
	app.game.state.pcount = playerCount;

	document.getElementById("auctionenabled").checked = settings.auctionEnabled;
	document.getElementById("freeparkingtaxes").checked = settings.freeParkingTaxes;
	for (var i = 1; i <= 8; i++) {
		document.getElementById("player" + i + "ai").value = settings.players[i - 1].ai;
		document.getElementById("player" + i + "color").value = settings.players[i - 1].color;
		document.getElementById("player" + i + "name").value = settings.players[i - 1].name;
		updateAIProfileVisibility(app);
		document.getElementById("player" + i + "aiProfile").value = settings.players[i - 1].profile;
	}
	playernumber_onchange(app);
	DOMUI.setVisible("#board, #control, #moneybar, #refresh", false);
	RenderBoard.setTokenOverlaysVisible(false, app.game);
	DOMUI.setVisible("#setup", true);
}

function populateProfileOptions(profileSelect) {
	var previousValue = profileSelect.value;
	profileSelect.innerHTML = "";
	var registry = getAISetupRegistry();
	var profileNames = ["Random"].concat(registry ? registry.getProfiles(profileSelect.dataset.aiType) : []);
	profileNames.forEach(function(profileName) {
		var option = new Option(profileName, profileName);
		if (profileName === previousValue || (previousValue === "" && profileName === "Random")) {
			option.selected = true;
		}
		profileSelect.appendChild(option);
	});
}

function updateAIProfileVisibility(app) {
	var aiSelects = document.querySelectorAll("[id$='ai']");
	for (var i = 0; i < aiSelects.length; i++) {
		var aiSelect = aiSelects[i];
		var playerId = aiSelect.id.replace("ai", "");
		var profileSelect = document.getElementById(playerId + "aiProfile");
		var nameInput = document.getElementById(playerId + "name");
		var isHuman = aiSelect.value === "0";
		var wasHuman = aiSelect.dataset.previousValue === "0";
		var registry = getAISetupRegistry();
		var profileNames = registry ? registry.getProfiles(aiSelect.value) : [];

		if (isHuman && !wasHuman) {
			nameInput.value = getNextHumanName(parseInt(playerId.replace("player", ""), 10), app);
		}
		if (!isHuman) {
			nameInput.value = "Bot";
		}
		nameInput.disabled = !isHuman;
		nameInput.style.display = isHuman ? "inline-block" : "none";
		if (profileNames.length) {
			profileSelect.dataset.aiType = aiSelect.value;
			populateProfileOptions(profileSelect);
		}
		profileSelect.style.display = profileNames.length ? "inline-block" : "none";
		aiSelect.dataset.previousValue = aiSelect.value;
	}
}

function getNextHumanName(excludeIndex, app) {
	var usedNames = {};
	for (var i = 1; i <= app.game.state.pcount; i++) {
		if (i === excludeIndex) continue;
		var type = document.getElementById("player" + i + "ai");
		var name = document.getElementById("player" + i + "name");
		if (type && name && type.value === "0") usedNames[name.value.trim().toLowerCase()] = true;
	}
	if (!usedNames.human) return "Human";
	var suffix = 2;
	while (usedNames[("human " + suffix).toLowerCase()]) suffix++;
	return "Human " + suffix;
}

function ensureUniqueHumanNames(app) {
	var usedNames = {};
	for (var i = 1; i <= app.game.state.pcount; i++) {
		var type = document.getElementById("player" + i + "ai");
		var name = document.getElementById("player" + i + "name");
		if (!type || !name || type.value !== "0") continue;
		var requestedName = name.value.trim() || "Human";
		var uniqueName = requestedName;
		var suffix = 2;
		while (usedNames[uniqueName.toLowerCase()]) uniqueName = requestedName + " " + suffix++;
		name.value = uniqueName;
		usedNames[uniqueName.toLowerCase()] = true;
	}
}

function createPlayerInputs(app) {
	var colors = ["yellow", "blue", "red", "lime", "green", "aqua", "orange", "purple"];
	var colorOptions = ["aqua", "black", "blue", "fuchsia", "gray", "green", "lime", "maroon", "navy", "olive", "orange", "purple", "red", "silver", "teal", "yellow"];
	var container = document.getElementById("player-inputs");

	for (var i = 1; i <= 8; i++) {
		var row = document.createElement("div");
		row.id = "player" + i + "input";
		row.className = "player-input";

		var label = document.createElement("span");
		label.className = "player-label";
		label.textContent = "Player " + i + ":";
		row.appendChild(label);

		var ai = document.createElement("select");
		ai.id = "player" + i + "ai";
		ai.title = "Choose whether this player is controlled by a human or by the computer.";
		var registry = getAISetupRegistry();
		var aiOptions = [{ id: "0", label: "Human" }].concat(registry ? registry.list() : []);
		var defaultAI = registry ? registry.getDefaultId() : null;
		aiOptions.forEach(function(optionData) {
			var option = new Option(optionData.label, optionData.id);
			if ((i === 1 && optionData.id === "0") || (i > 1 && optionData.id === defaultAI)) {
				option.selected = true;
			}
			ai.appendChild(option);
		});
		ai.addEventListener("change", function() { updateAIProfileVisibility(app); });
		row.appendChild(ai);

		var color = document.createElement("select");
		color.id = "player" + i + "color";
		color.title = "Player color";
		colorOptions.forEach(function(colorName) {
			var option = new Option(colorName.charAt(0).toUpperCase() + colorName.slice(1), colorName);
			option.style.color = colorName;
			if (colorName === colors[i - 1]) {
				option.selected = true;
			}
			color.appendChild(option);
		});
		row.appendChild(color);

		var name = document.createElement("input");
		name.type = "text";
		name.id = "player" + i + "name";
		name.title = "Player name";
		name.maxLength = 16;
		name.value = i === 1 ? "Human" : "Bot";
		name.disabled = i !== 1;
		row.appendChild(name);

		var profile = document.createElement("select");
		profile.id = "player" + i + "aiProfile";
		profile.title = "Choose the AI's personality profile.";
		row.appendChild(profile);
		container.appendChild(row);
	}
}

function playernumber_onchange(app) {
	DOMUI.setVisible(".player-input", false);

	for (var i = 1; i <= app.game.state.pcount; i++) {
		DOMUI.setVisible("#player" + i + "input", true);
	}

	DOMUI.nodes('.remove-player-button').forEach(function(button) { button.remove(); });
	if (app.game.state.pcount > 2) {
		for (var i = 1; i <= app.game.state.pcount; i++) {
			var button = document.createElement('input'); button.type = 'button'; button.className = 'remove-player-button'; button.value = 'Remove'; button.title = 'Remove this player.';
			button.addEventListener('click', removePlayer.bind(null, i, app));
			document.getElementById('player' + i + 'input').appendChild(button);
		}
	}

	var addPlayerButton = document.getElementById("addplayerbutton");
	if (addPlayerButton) {
		addPlayerButton.style.display = app.game.state.pcount >= 8 ? "none" : "inline-block";
	}

	updateAIProfileVisibility(app);
}

function addPlayer(app) {
	if (app.game.state.pcount >= 8) {
		return;
	}

	app.game.state.pcount++;
	var name = document.getElementById("player" + app.game.state.pcount + "name");
	name.value = "Bot";
	name.disabled = true;
	var registry = getAISetupRegistry();
	document.getElementById("player" + app.game.state.pcount + "ai").value = registry ? registry.getDefaultId() : "0";
	document.getElementById("player" + app.game.state.pcount + "aiProfile").value = "Random";
	playernumber_onchange(app);
}

function removePlayer(index, app) {
	if (app.game.state.pcount <= 2 || index < 1 || index > app.game.state.pcount) {
		return;
	}

	if (index !== app.game.state.pcount) {
		var removedName = document.getElementById("player" + index + "name");
		var lastName = document.getElementById("player" + app.game.state.pcount + "name");
		var removedColor = document.getElementById("player" + index + "color");
		var lastColor = document.getElementById("player" + app.game.state.pcount + "color");
		var removedAI = document.getElementById("player" + index + "ai");
		var lastAI = document.getElementById("player" + app.game.state.pcount + "ai");
		var removedProfile = document.getElementById("player" + index + "aiProfile");
		var lastProfile = document.getElementById("player" + app.game.state.pcount + "aiProfile");

		removedName.value = lastName.value;
		removedName.disabled = lastName.disabled;
		removedColor.value = lastColor.value;
		removedAI.value = lastAI.value;
		removedProfile.value = lastProfile.value;
	}

	app.game.state.pcount--;
	playernumber_onchange(app);
}

var api = { collectSetupConfiguration: collectSetupConfiguration, setSetupService: setSetupService, getSetupService: getSetupService, setAISetupRegistry: setAISetupRegistry, createPlayerInputs: createPlayerInputs, setup: setup, restartGame: restartGame, playernumber_onchange: playernumber_onchange, addPlayer: addPlayer, removePlayer: removePlayer, updateAIProfileVisibility: updateAIProfileVisibility };
global.SetupScreen = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
