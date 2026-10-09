var BoardIdCatalogs = {
	Classic: {
		squareIds: [
			"go", "mediterranean-avenue", "community-chest-south", "baltic-avenue", "city-tax",
			"reading-railroad", "oriental-avenue", "chance-south", "vermont-avenue", "connecticut-avenue",
			"jail", "st-charles-place", "electric-company", "states-avenue", "virginia-avenue",
			"pennsylvania-railroad", "st-james-place", "community-chest-west", "tennessee-avenue", "new-york-avenue",
			"free-parking", "kentucky-avenue", "chance-east", "indiana-avenue", "illinois-avenue",
			"b-o-railroad", "atlantic-avenue", "ventnor-avenue", "water-works", "marvin-gardens",
			"go-to-jail", "pacific-avenue", "north-carolina-avenue", "community-chest-east", "pennsylvania-avenue",
			"short-line", "chance-north", "park-place", "luxury-tax", "boardwalk"
		],
		groupIds: ["railroads", "utilities", "brown", "light-blue", "pink", "orange", "red", "yellow", "green", "blue"]
	},
	NYC: {
		squareIds: [
			"go", "port-authority-bus-terminal", "community-chest-south", "lincoln-tunnel", "city-tax",
			"lomto", "statue-of-liberty", "chance-south", "empire-state-building", "central-park",
			"jail", "98-7-kiss-fm", "con-edison-electric", "thirteen-wnet", "the-new-york-times",
			"new-york-city-transit", "new-york-rangers", "community-chest-west", "new-york-knicks", "madison-square-garden",
			"free-parking", "macy-s", "chance-east", "fao-schwarz", "bloomingdale-s",
			"metro-north-railroad", "deloitte-touche-llp", "smithbarney", "con-edison-gas", "citibank",
			"go-to-jail", "the-regency-hotel", "essex-house", "community-chest-east", "the-plaza",
			"united-airlines", "chance-north", "tiffany-co", "luxury-tax", "trump-tower"
		],
		groupIds: ["railroads", "utilities", "dark-purple", "light-blue", "purple", "orange", "red", "yellow", "green", "blue"]
	}
};

if (typeof window !== "undefined") window.BoardIdCatalogs = BoardIdCatalogs;
else if (typeof globalThis !== "undefined") globalThis.BoardIdCatalogs = BoardIdCatalogs;

if (typeof module !== "undefined" && module.exports) module.exports = BoardIdCatalogs;