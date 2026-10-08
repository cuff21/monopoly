/**
 * NetworkAdapter for MonopolyNEAT Gen6 AI
 * Translates Monopoly game state to legacy 126-, 146-, or current 147-input schemas
 * and decodes 9 neural network outputs.
 * 
 * Compatible with b2developer/MonopolyNEAT C# implementation.
 */
(function(global) {
    'use strict';

    // The 28 standard purchasable property tile indices in order around the board
    var PURCHASABLE_INDICES = [
        1, 3, 5, 6, 8, 9, 11, 12, 13, 14, 15, 16, 18, 19,
        21, 23, 24, 25, 26, 27, 28, 29, 31, 32, 34, 35, 37, 39
    ];

    // The 22 street property tile indices with houses (excludes 4 railroads and 2 utilities)
    var STREET_INDICES = [
        1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19,
        21, 23, 24, 26, 27, 29, 31, 32, 34, 37, 39
    ];

    var NetworkAdapter = {
        INPUT_COUNT: 147,
        EIGHT_PLAYER_INPUT_COUNT: 146,
        LEGACY_INPUT_COUNT: 126,
        OUTPUT_COUNT: 9,
        OUTPUT_OFFSET: 147,
        EIGHT_PLAYER_OUTPUT_OFFSET: 146,
        LEGACY_OUTPUT_OFFSET: 126,
        PURCHASABLE_INDICES: PURCHASABLE_INDICES,
        STREET_INDICES: STREET_INDICES,

        /**
         * Encodes state into v1 (126), v2 (146), or v3 (147) model inputs.
         * 
         * @param {Object} state - Monopoly state or abstraction
         * @param {Array} state.players - Array of 4 players (or padded to 4)
         * @param {number} state.currentTurn - Index of current player (0..3)
         * @param {Array} state.squares - 40 board squares/properties
         * @param {number} [state.selectedPropertyIndex] - Currently selected/relevant property
         * @param {number} [state.contextMoney] - Context money (for trade/auction)
            * @param {Array<number>} [state.contextProperties] - Signed property transfers for a trade
            * @param {number} [inputCount=126] - Model input count; 146/147 use eight-player features.
            * @returns {Float64Array} Model input vector
         */
        encodeInputs: function(state, inputCount) {
                inputCount = inputCount === 126 || inputCount === 146 || inputCount === 147 ? inputCount : 126;
                var playerSlots = inputCount === 126 ? 4 : 8;
            var ownerOffset = playerSlots * 5;
            var mortgageOffset = ownerOffset + PURCHASABLE_INDICES.length;
            var housesOffset = mortgageOffset + PURCHASABLE_INDICES.length;
            var selectedOffset = housesOffset + STREET_INDICES.length;
            var inputs = new Float64Array(inputCount);
            var players = state.players || [];
            var currentTurn = (state.currentTurn !== undefined ? state.currentTurn : 0) % playerSlots;
            var squares = state.squares || [];
            var selectedTile = state.selectedPropertyIndex !== undefined ? state.selectedPropertyIndex : -1;
            var contextProperties = state.contextProperties;

            // Turn one-hot
            inputs[currentTurn] = 1.0;

            // Player positions
            for (var p = 0; p < playerSlots; p++) {
                if (players[p]) {
                    var pos = players[p].position || 0;
                    inputs[playerSlots + p] = Math.max(0.0, Math.min(1.0, pos / 39.0));
                }
            }

            // Player funds
            for (var p = 0; p < playerSlots; p++) {
                if (players[p]) {
                    var money = players[p].money !== undefined ? players[p].money : 0;
                    inputs[playerSlots * 2 + p] = Math.max(0.0, Math.min(1.0, money / 4000.0));
                }
            }

            // Jail card count
            for (var p = 0; p < playerSlots; p++) {
                if (players[p]) {
                    var cards = (players[p].communityChestJailCard ? 1 : 0) + (players[p].chanceJailCard ? 1 : 0);
                    inputs[playerSlots * 3 + p] = Math.max(0.0, Math.min(1.0, cards / 2.0));
                }
            }

            // In-jail status
            for (var p = 0; p < playerSlots; p++) {
                if (players[p]) {
                    inputs[playerSlots * 4 + p] = (players[p].jail || players[p].inJail) ? 1.0 : 0.0;
                }
            }

            // Purchasable property owners: unowned=0, players are normalized to (0, 1].
            for (var i = 0; i < PURCHASABLE_INDICES.length; i++) {
                var tileIdx = PURCHASABLE_INDICES[i];
                var sq = squares[tileIdx];
                if (sq && sq.owner !== undefined && sq.owner !== 0 && sq.owner !== -1) {
                    var ownerIdx = (typeof sq.owner === 'object') ? sq.owner.index : (sq.owner - 1);
                    if (ownerIdx >= 0 && ownerIdx < playerSlots) {
                        inputs[ownerOffset + i] = (ownerIdx + 1) / playerSlots;
                    }
                } else {
                    inputs[ownerOffset + i] = 0.0;
                }
            }

            // Property mortgage states
            for (var i = 0; i < PURCHASABLE_INDICES.length; i++) {
                var tileIdx = PURCHASABLE_INDICES[i];
                var sq = squares[tileIdx];
                inputs[mortgageOffset + i] = (sq && sq.mortgage) ? 1.0 : 0.0;
            }

            // Street property house levels
            for (var i = 0; i < STREET_INDICES.length; i++) {
                var tileIdx = STREET_INDICES[i];
                var sq = squares[tileIdx];
                var houses = (sq && sq.hotel) ? 5 : ((sq && sq.house) ? sq.house : 0);
                inputs[housesOffset + i] = Math.max(0.0, Math.min(1.0, houses / 5.0));
            }

            // Property selection flags
            for (var i = 0; i < PURCHASABLE_INDICES.length; i++) {
                var propertyValue = contextProperties && contextProperties[PURCHASABLE_INDICES[i]];
                if (inputCount === 147 && propertyValue) {
                    inputs[selectedOffset + i] = Math.max(-1.0, Math.min(1.0, propertyValue));
                } else {
                    inputs[selectedOffset + i] = (PURCHASABLE_INDICES[i] === selectedTile) ? 1.0 : 0.0;
                }
            }

            if (inputCount === 147) {
                var contextMoney = state.contextMoney || 0;
                inputs[146] = Math.max(-1.0, Math.min(1.0, contextMoney / 4000.0));
            }

            return inputs;
        },

        /**
         * Decodes raw neural network outputs into game decisions.
         * 
         * @param {Array|Float64Array} outputs - 9 outputs following the model's input nodes
         * @returns {Object} Interpreted decisions
         */
        decodeOutputs: function(outputs) {
            var y = outputs;
            return {
                buyProperty: y[0] > 0.5,
                jailAction: y[1] < 0.333 ? 'card' : (y[1] < 0.666 ? 'roll' : 'pay'),
                mortgage: y[2] > 0.5,
                unmortgage: y[3] > 0.5,
                bidValue: Math.max(0, Math.round(y[4] * 4000.0)),
                buildHouseCount: y[5] <= 0.5 ? 0 : Math.round(y[5] * 15.0),
                sellHouseCount: y[6] <= 0.5 ? 0 : Math.round(y[6] * 15.0),
                proposeTrade: y[7] > 0.5,
                acceptTrade: y[8] > 0.5,
                raw: y
            };
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = NetworkAdapter;
    }
    global.NetworkAdapter = NetworkAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
