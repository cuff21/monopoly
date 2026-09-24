function importData() {
    const value = document.querySelector('#textarea').value;
    if (!GameStorage.importHistory(value)) {
        alert('Import failed: game history must be valid JSON containing an array.');
    }
}

function exportData() {
    document.querySelector('#textarea').value = GameStorage.exportHistory();
}

function generateParameters() {
    // Initial parameters
    const params = {
        purchaseThreshold: normal(10, 2.5),
        housePurchaseThreshold: normal(10, 2.5),
        bidUp: normal(30, 6),
        tradeAcceptanceThreshold: normal(0, 10),
        tradeRejectionThreshold: normal(-100, 20),
        spotsBehind: normal(10, 2.5),
        spotsAhead: normal(10, 2.5),
        communityChestJailCardValue: normal(10, 2.5),
        chanceJailCardValue: normal(10, 2.5),
        maxAmountOfRejections: normal(3, 1),
        firstBuildingOdds: normal(35, 10),
        lastBuildingOdds: normal(80, 10)
    };
    const gameHistory = GameStorage.getHistory();
    // 20% chance of making player from initial parameters
    if(Math.random() < 0.8 && gameHistory.length > 1) {
        let newParamsMeans = {};
        let newParamsSDs = {};
        for(const param in params) {
            newParamsMeans[param] = 0;
            newParamsSDs[param] = 0;
        }
        
        let winningPlayers = [];
        for(const game of gameHistory) {
            if (!Array.isArray(game)) continue;
            for(const player of game) {
                // Only draw from this AI type's own history so gen5's separate param schema can't pollute these means.
                if(player && player.params && player.result === 'win' && (player.type || 'genetic3') === 'genetic3') {
                    winningPlayers.push(player.params);
                }
            }
        }
        if (winningPlayers.length === 0) {
            return params;
        }
        for(const player of winningPlayers) {
            for(const param in player) {
                newParamsMeans[param] += player[param] / winningPlayers.length;
            }
        }
        for(const player of winningPlayers) {
            for(const param in player) {
                newParamsSDs[param] += (player[param] - newParamsMeans[param])**2 / winningPlayers.length;
            }
        }
        for(const param in newParamsSDs) {
            newParamsSDs[param] = Math.sqrt(newParamsSDs[param]);
        }
        for(const param in params) {
            params[param] = normal(newParamsMeans[param], newParamsSDs[param]);
        }
        
        console.log('%c Created player from previous winners.', 'color: green;');
    } else {
        console.log('%c Created initial player.', 'color: red;');
    }
    params.purchaseThreshold = Math.max(params.purchaseThreshold, 0);
    params.housePurchaseThreshold = Math.max(params.housePurchaseThreshold, 0);
    params.bidUp = Math.max(params.bidUp, 0);
    params.spotsBehind = Math.floor(Math.min(Math.max(params.spotsBehind, 0), 40));
    params.spotsAhead = Math.floor(Math.min(Math.max(params.spotsAhead, 0), 40));
    params.communityChestJailCardValue = Math.max(params.communityChestJailCardValue, 0);
    params.chanceJailCardValue = Math.max(params.chanceJailCardValue, 0);
    params.maxAmountOfRejections = Math.max(params.maxAmountOfRejections, 1);
    params.firstBuildingOdds = Math.min(Math.max(params.firstBuildingOdds, 0), 100);
    params.lastBuildingOdds = Math.min(Math.max(params.lastBuildingOdds, 0), 100);
    console.log(params);
    
    return params;
}

function normal(m, sd) {
    let u = 0, v = 0;
    const mean = m || 0;
    const st_d = sd || 1;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    const val = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    return val * st_d + mean;
}

// Expose globals explicitly for tests/tooling.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateParameters: generateParameters, normal: normal, importData: importData, exportData: exportData };
}
if (typeof globalThis !== 'undefined') {
    globalThis.generateParameters = generateParameters;
    globalThis.normal = normal;
}
