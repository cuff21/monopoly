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

function collectSetupConfiguration() {
	var configuration = {
		auctionEnabled: document.getElementById("auctionenabled").checked,
		freeParkingTaxes: document.getElementById("freeparkingtaxes").checked,
		players: []
	};
	for (var i = 1; i <= pcount; i++) {
		configuration.players.push({
			ai: document.getElementById("player" + i + "ai").value,
			color: document.getElementById("player" + i + "color").value,
			name: document.getElementById("player" + i + "name").value,
			profile: document.getElementById("player" + i + "aiProfile").value
		});
	}
	return configuration;
}

function setup() {
	lastGamePlayerCount = pcount;
	var configuration = collectSetupConfiguration();
	auctionEnabled = configuration.auctionEnabled;
	freeParkingTaxes = configuration.freeParkingTaxes;
	freeParkingPot = 0;
	updateFreeParkingDisplay(game);
	pendingAuction = -1;
	ensureUniqueHumanNames();
    playersGame = [];
    
    const els = document.querySelectorAll('.mortgaged');
    for(const el of els) {
        el.classList.remove('mortgaged');
    }

	playersGame = getSetupService().createPlayers(configuration, player.slice(1, pcount + 1));

	$("#board, #moneybar").show();
	setTokenOverlaysVisible(true, game);
	$("#setup").hide();
	$("#refresh").hide();

	if (pcount === 2) {
		document.getElementById("stats").style.width = "454px";
	} else if (pcount === 3) {
		document.getElementById("stats").style.width = "686px";
	}

	document.getElementById("stats").style.top = "0px";
	document.getElementById("stats").style.left = "0px";
	console.log("Starting the game!");
    game.onGameError = function(error) { game.ui.showMessage('Game stopped: ' + error.message, undefined, undefined, 0); };
    Promise.resolve(game.play()).catch(function() { /* onGameError presents the failure. */ });
}

function restartGame() {
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

	pcount = lastGamePlayerCount;
	$("#popupwrap, #popupbackground").hide();
	document.getElementById("player-inputs").innerHTML = "";
	$("#alert").empty();
	onloadBehavior();

	document.getElementById("auctionenabled").checked = settings.auctionEnabled;
	document.getElementById("freeparkingtaxes").checked = settings.freeParkingTaxes;
	for (var i = 1; i <= 8; i++) {
		document.getElementById("player" + i + "ai").value = settings.players[i - 1].ai;
		document.getElementById("player" + i + "color").value = settings.players[i - 1].color;
		document.getElementById("player" + i + "name").value = settings.players[i - 1].name;
		updateAIProfileVisibility();
		document.getElementById("player" + i + "aiProfile").value = settings.players[i - 1].profile;
	}
	playernumber_onchange();
	$("#board, #control, #moneybar, #refresh").hide();
	setTokenOverlaysVisible(false, game);
	$("#setup").show();
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

function updateAIProfileVisibility() {
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
			nameInput.value = getNextHumanName(parseInt(playerId.replace("player", ""), 10));
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

if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		collectSetupConfiguration: collectSetupConfiguration,
		setSetupService: setSetupService,
			setAISetupRegistry: setAISetupRegistry,
			createPlayerInputs: createPlayerInputs
	};
}

function getNextHumanName(excludeIndex) {
	var usedNames = {};
	for (var i = 1; i <= pcount; i++) {
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

function ensureUniqueHumanNames() {
	var usedNames = {};
	for (var i = 1; i <= pcount; i++) {
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

function createPlayerInputs() {
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
		ai.addEventListener("change", updateAIProfileVisibility);
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

function playernumber_onchange() {
	$(".player-input").hide();

	for (var i = 1; i <= pcount; i++) {
		$("#player" + i + "input").show();
	}

	$(".remove-player-button").remove();
	if (pcount > 2) {
		for (var i = 1; i <= pcount; i++) {
			$("#player" + i + "input").append("<input type='button' class='remove-player-button' value='Remove' onclick='removePlayer(" + i + ");' title='Remove this player.' />");
		}
	}

	var addPlayerButton = document.getElementById("addplayerbutton");
	if (addPlayerButton) {
		addPlayerButton.style.display = pcount >= 8 ? "none" : "inline-block";
	}

	updateAIProfileVisibility();
}

function addPlayer() {
	if (pcount >= 8) {
		return;
	}

	pcount++;
	var name = document.getElementById("player" + pcount + "name");
	name.value = "Bot";
	name.disabled = true;
	var registry = getAISetupRegistry();
	document.getElementById("player" + pcount + "ai").value = registry ? registry.getDefaultId() : "0";
	document.getElementById("player" + pcount + "aiProfile").value = "Random";
	playernumber_onchange();
}

function removePlayer(index) {
	if (pcount <= 2 || index < 1 || index > pcount) {
		return;
	}

	if (index !== pcount) {
		var removedName = document.getElementById("player" + index + "name");
		var lastName = document.getElementById("player" + pcount + "name");
		var removedColor = document.getElementById("player" + index + "color");
		var lastColor = document.getElementById("player" + pcount + "color");
		var removedAI = document.getElementById("player" + index + "ai");
		var lastAI = document.getElementById("player" + pcount + "ai");
		var removedProfile = document.getElementById("player" + index + "aiProfile");
		var lastProfile = document.getElementById("player" + pcount + "aiProfile");

		removedName.value = lastName.value;
		removedName.disabled = lastName.disabled;
		removedColor.value = lastColor.value;
		removedAI.value = lastAI.value;
		removedProfile.value = lastProfile.value;
	}

	pcount--;
	playernumber_onchange();
}

function menuitem_onmouseover(element) {
	element.className = "menuitem menuitem_hover";
	return;
}

function menuitem_onmouseout(element) {
	element.className = "menuitem";
	return;
}
