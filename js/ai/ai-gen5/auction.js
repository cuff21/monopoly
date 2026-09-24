// Gen5 AI: auction bidding, with a block-bid premium to deny a Leader a monopoly-completing property.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function bid(p, profile, params, property, currentBid) {
        params = params || {};
        var square = globalThis.square;
        var s = square[property];
        if (!s || s.owner !== 0) {
            return -1;
        }

        var value = AIGen5.Valuation.evaluateProperty(property, p.index, p.money, profile, 0);
        var reserve = AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(p, profile) : 120;
        var minimumBid = currentBid + 1;

        if (value < 65) {
            return currentBid > 0 ? -1 : 0;
        }

        var valuePremium = Math.max(0, Math.min(1.25, (value - s.price * 0.18) / 100));
        var valueMultiplier = 0.7 + valuePremium * 0.45;
        var profileMultiplier = profile.auctionBias || 1;

        var blockPremium = 1;
        if (s.group && s.group.length > 1) {
            var ownedByOthers = {};
            for (var i = 0; i < s.group.length; i++) {
                var owner = square[s.group[i]].owner;
                if (owner !== 0) {
                    ownedByOthers[owner] = (ownedByOthers[owner] || 0) + 1;
                }
            }
            for (var ownerKey in ownedByOthers) {
                if (ownedByOthers[ownerKey] === s.group.length - 1) {
                    var opponent = AIGen5.Analytics ? AIGen5.Analytics.getPlayerByIndex(Number(ownerKey)) : null;
                    var rank = opponent && AIGen5.Analytics ? AIGen5.Analytics.strengthRank(opponent) : 'Contender';
                    if (rank === 'Leader') {
                        blockPremium = Math.max(blockPremium, params.auctionBlockPremium || 1.3);
                    }
                }
            }
        }

        var maxBid = Math.round(s.price * valueMultiplier * profileMultiplier * blockPremium);
        var affordableBid = Math.floor(p.money - reserve);
        maxBid = Math.min(maxBid, affordableBid);

        if (maxBid < minimumBid) {
            return currentBid > 0 ? -1 : 0;
        }

        var bidStep = 10;
        var nextBid = currentBid === 0 ? Math.min(bidStep, maxBid) : currentBid + bidStep;
        return Math.min(nextBid, maxBid);
    }

    AIGen5.Auction = {
        bid: bid
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.Auction;
    }
})(typeof window !== 'undefined' ? window : globalThis);
