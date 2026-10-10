// Gen5 AI: auction bidding, with a block-bid premium to deny a Leader a monopoly-completing property.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function bid(p, profile, params, property, currentBid) {
        params = params || {};
        var view = AIGen5.getDecisionView(p);
        if (!Number.isFinite(p.money) || !Number.isInteger(currentBid) || currentBid < 0 || !view.board.squaresById[property]) return -1;
        var s = view.getSquare(property);
        var sGroupIds = AIGen5.groupIds(view, s);
        if (!s || view.getSquareState(s.id).ownerId !== null) {
            return -1;
        }

        var value = AIGen5.Valuation.evaluateProperty(property, p.playerId, p.money, profile, 0, p);
        var reserve = AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(p, profile) : 120;
        var minimumBid = currentBid + 1;

        if (value < 65) {
            return currentBid > 0 ? -1 : 0;
        }

        var valuePremium = Math.max(0, Math.min(1.25, (value - s.rules.purchasePrice * 0.18) / 100));
        var valueMultiplier = 0.7 + valuePremium * 0.45;
        var profileMultiplier = profile.auctionBias || 1;

        var blockPremium = 1;
        if (sGroupIds.length > 1) {
            var ownedByOthers = Object.create(null);
            for (var i = 0; i < sGroupIds.length; i++) {
                var owner = view.getSquareState(sGroupIds[i]).ownerId;
                if (owner !== null) {
                    ownedByOthers[owner] = (ownedByOthers[owner] || 0) + 1;
                }
            }
            for (var ownerKey in ownedByOthers) {
                if (ownedByOthers[ownerKey] === sGroupIds.length - 1) {
                    var opponent = AIGen5.Analytics ? AIGen5.Analytics.getPlayerById(ownerKey, p) : null;
                    var rank = opponent && AIGen5.Analytics ? AIGen5.Analytics.strengthRank(opponent) : 'Contender';
                    if (rank === 'Leader') {
                        blockPremium = Math.max(blockPremium, params.auctionBlockPremium || 1.3);
                    }
                }
            }
        }

        var maxBid = Math.round(s.rules.purchasePrice * valueMultiplier * profileMultiplier * blockPremium);
        var affordableBid = Math.floor(p.money - reserve);
        if (!Number.isFinite(maxBid) || !Number.isFinite(affordableBid)) return -1;
        maxBid = Math.min(maxBid, affordableBid, Math.floor(p.money));
        if (!Number.isFinite(maxBid)) return -1;

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
