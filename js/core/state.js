// Player/Trade data types and the mutable game state shared across every other module.

function Player(name, color) {
	this.name = name;
	this.color = color;
	this.position = 0;
	this.money = 1500;
	this.creditor = -1;
	this.jail = false;
	this.jailroll = 0;
	this.communityChestJailCard = false;
	this.chanceJailCard = false;
	this.bidding = true;
	this.human = true;
	// this.AI = null;

	this.pay = function (amount, creditor) {
		if (amount <= this.money) {
			this.money -= amount;

			updateMoney();

			return true;
		} else {
			this.money -= amount;
			this.creditor = creditor;

			updateMoney();

			return false;
		}
	};
}

// paramaters:
// initiator: object Player
// recipient: object Player
// money: integer, positive for offered, negative for requested
// property: array of integers, length: 40
// communityChestJailCard: integer, 1 means offered, -1 means requested, 0 means neither
// chanceJailCard: integer, 1 means offered, -1 means requested, 0 means neither
function Trade(initiator, recipient, money, property, communityChestJailCard, chanceJailCard) {
	// For each property and get out of jail free cards, 1 means offered, -1 means requested, 0 means neither.
	money = Math.round(money);

	this.getInitiator = function() {
		return initiator;
	};

	this.getRecipient = function() {
		return recipient;
	};

	this.getProperty = function(index) {
		return property[index];
	};

	this.getMoney = function() {
		return money;
	};

	this.getCommunityChestJailCard = function() {
		return communityChestJailCard;
	};

	this.getChanceJailCard = function() {
		return chanceJailCard;
	};
}

var square = [];
var communityChestCards = [];
var chanceCards = [];

var player = [];
var playersGame = [];
var pcount = 2;
var auctionEnabled = true;
var pendingAuction = -1;
var freeParkingTaxes = true;
var freeParkingPot = 0;
var turn = 0, doublecount = 0;
var lastGamePlayerCount = pcount;

// Tracks each player's last rendered board position/jail state so updatePosition() can animate moves.
var lastKnownPosition = [];
var lastKnownJail = [];

// Overlay tokens that visually slide around the board while the real (hidden) tokens keep the
// existing instant-render logic; overlays just get repositioned to match the real tokens' rects.
var playerOverlays = [];

// Direction (1 = forward/clockwise, -1 = backward/counter-clockwise) for the next animated move,
// consumed and reset to forward by updatePosition(). Only "Go Back Three Spaces" moves backward.
var nextMoveDirection = 1;

// The four corner cells; a move passes through whichever of these lie between its start and end.
var boardCorners = [0, 10, 20, 30];

// Rebuilds `square`, `communityChestCards`, and `chanceCards` from the currently active edition.
function redefineGame() {
	var edition = Monopoly.Editions.getActive();

	square = edition.buildSquares();

	communityChestCards = edition.buildCommunityChestCards();
	chanceCards = edition.buildChanceCards();
}
