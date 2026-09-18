// Formal plugin interface for board "editions". Exactly one edition script should be included
// in index.html (comment/uncomment to switch); whichever one registers becomes the active edition.
//
// A definition must provide:
//   buildSquares()             -> Square[40]
//   buildCommunityChestCards() -> Card[16]
//   buildChanceCards()         -> Card[16]
//   corrections()              -> post-DOM-build per-edition text/image fixups
//   text: { utility(), transit() }  -> deed tooltip HTML for utilities/railroads
//   tax:  { city(), luxury() }      -> handlers for the City Tax / Luxury Tax squares

window.Monopoly = window.Monopoly || {};

Monopoly.Editions = (function() {
	var editions = {};
	var activeName = null;

	function register(name, definition) {
		editions[name] = definition;
		activeName = name;
	}

	function getActive() {
		return editions[activeName];
	}

	return { register: register, getActive: getActive };
})();
