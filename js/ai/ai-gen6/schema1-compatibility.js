(function(global) {
    'use strict';

    var LEGACY_KEYS = ['gen6Population', 'gen6Champion'];
    var POLICY_FIELDS = ['format', 'schemaVersion', 'policyId', 'tensors', 'validation', 'coverage'];
    var TRAINING_STATE_FIELDS = [
        'format', 'schemaVersion', 'stateId', 'iteration', 'trainingProfile', 'theta', 'logSigma',
        'initialSigma', 'thetaAdamFirstMoment', 'thetaAdamSecondMoment', 'logSigmaAdamFirstMoment',
        'logSigmaAdamSecondMoment', 'masterSeed', 'nextScenarioSlot', 'boardSetVersion',
        'candidateArchive', 'champions'
    ];
    var TENSOR_SHAPES = [
        ['tile.W1', [32, 50]], ['tile.b1', [32]], ['tile.W2', [32, 32]], ['tile.b2', [32]],
        ['context.embedding', [7, 16]], ['context.tradeCard.W', [16, 2]], ['context.tradeCard.b', [16]],
        ['attention.W', [32, 109]], ['attention.b', [32]], ['trunk.W1', [64, 173]], ['trunk.b1', [64]],
        ['trunk.W2', [64, 64]], ['trunk.b2', [64]], ['head.acquire.W', [1, 64]], ['head.acquire.b', [1]],
        ['head.auction.W', [1, 64]], ['head.auction.b', [1]], ['head.jail.W', [3, 64]], ['head.jail.b', [3]],
        ['head.propertyGates.W', [3, 64]], ['head.propertyGates.b', [3]], ['head.debtGates.W', [2, 64]],
        ['head.debtGates.b', [2]], ['head.tradePropose.W', [1, 64]], ['head.tradePropose.b', [1]],
        ['head.tradeRespond.W', [2, 64]], ['head.tradeRespond.b', [2]], ['head.tradeCash.W', [1, 64]],
        ['head.tradeCash.b', [1]], ['candidate.query.W', [32, 64]], ['candidate.query.b', [32]],
        ['candidate.operation.embedding', [4, 32]], ['candidate.operation.bias', [4]],
        ['candidate.seat.W', [32, 6]], ['candidate.seat.b', [32]], ['candidate.jailCard.embedding', [1, 32]],
        ['candidate.direction.embedding', [2, 32]], ['candidate.tradeAsset.bias', [1]]
    ];
    var PARAMETER_COUNT = 25107;
    var TILE_KINDS = ['street', 'railroad', 'utility', 'tax', 'card', 'jail', 'go-to-jail', 'free-parking', 'go'];

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function hasExactFields(record, fields) {
        var actual = Object.keys(record).sort();
        var expected = fields.slice().sort();
        return actual.length === expected.length && actual.every(function(field, index) {
            return field === expected[index];
        });
    }

    function normalizeCardCount(count) {
        if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Gen6 card count must be a finite nonnegative safe integer.');
        return Math.fround(Math.log1p(count));
    }

    function encodeTileKind(kind) {
        var index = TILE_KINDS.indexOf(kind);
        if (index < 0) throw new RangeError('Unknown Schema 1 tile kind: ' + kind);
        var features = new Float32Array(TILE_KINDS.length);
        features[index] = 1;
        return features;
    }

    function encodeTradeCardTransfer(givenCount, receivedCount) {
        return new Float32Array([normalizeCardCount(givenCount), normalizeCardCount(receivedCount)]);
    }

    function jailActionMask(heldCardCount, cash, bailAmount) {
        if (!Number.isSafeInteger(heldCardCount) || heldCardCount < 0 || !Number.isFinite(cash) || !Number.isFinite(bailAmount) || bailAmount < 0) {
            throw new RangeError('Invalid Gen6 jail decision state.');
        }
        return [heldCardCount > 0, true, cash >= bailAmount];
    }

    function encodeJailCardCandidateKey(holderSeatOrdinal, direction, copyOrdinal) {
        if (!Number.isInteger(holderSeatOrdinal) || holderSeatOrdinal < 1 || holderSeatOrdinal > 8 ||
            (direction !== 0 && direction !== 1) || !Number.isInteger(copyOrdinal) || copyOrdinal < 0 || copyOrdinal > 0xffffffff) {
            throw new RangeError('Invalid generic jail-card candidate descriptor.');
        }
        var bytes = new Uint8Array(13);
        bytes.set([71, 54, 75, 49, 2, 255, direction, 1, holderSeatOrdinal], 0); // G6K1 / trade asset / generic jail card
        bytes[9] = copyOrdinal & 0xff;
        bytes[10] = (copyOrdinal >>> 8) & 0xff;
        bytes[11] = (copyOrdinal >>> 16) & 0xff;
        bytes[12] = Math.floor(copyOrdinal / 0x1000000) & 0xff;
        return bytes;
    }

    function hasValidTensorEnvelope(tensors, exactSchema1) {
        if (!Array.isArray(tensors) || tensors.length === 0 || (exactSchema1 && tensors.length !== TENSOR_SHAPES.length)) return false;
        var names = Object.create(null);
        var valid = tensors.every(function(tensor, tensorIndex) {
            if (!isObject(tensor) || !hasExactFields(tensor, ['name', 'shape', 'values']) ||
                typeof tensor.name !== 'string' || !tensor.name || names[tensor.name] ||
                !Array.isArray(tensor.shape) || tensor.shape.length === 0 ||
                !(tensor.values instanceof Float32Array)) return false;
            names[tensor.name] = true;
            var elementCount = 1;
            for (var index = 0; index < tensor.shape.length; index++) {
                if (!Number.isInteger(tensor.shape[index]) || tensor.shape[index] <= 0) return false;
                elementCount *= tensor.shape[index];
            }
            if (elementCount !== tensor.values.length) return false;
            if (exactSchema1) {
                var expected = TENSOR_SHAPES[tensorIndex];
                if (tensor.name !== expected[0] || tensor.shape.length !== expected[1].length ||
                    !tensor.shape.every(function(size, dimension) { return size === expected[1][dimension]; })) return false;
            }
            for (var valueIndex = 0; valueIndex < tensor.values.length; valueIndex++) {
                if (!Number.isFinite(tensor.values[valueIndex])) return false;
            }
            return true;
        });
        if (!valid) return false;
        return !exactSchema1 || tensors.reduce(function(total, tensor) { return total + tensor.values.length; }, 0) === PARAMETER_COUNT;
    }

    function assertSchema1Record(record) {
        if (!record || typeof record !== 'object' || Array.isArray(record) || record.schemaVersion !== 1) {
            throw new Error('Unsupported Gen6 data: schemaVersion 1 is required.');
        }
        if (record.format === 'monopoly-gen6-policy') {
            if (!hasExactFields(record, POLICY_FIELDS) || record.policyId !== 'active' ||
                !hasValidTensorEnvelope(record.tensors, true) || !isObject(record.validation) || !isObject(record.coverage)) {
                throw new Error('Malformed Schema 1 Gen6 policy record.');
            }
        } else if (record.format === 'monopoly-gen6-training-state') {
            if (!hasExactFields(record, TRAINING_STATE_FIELDS) || record.stateId !== 'active' ||
                !Number.isInteger(record.iteration) || record.iteration < 0 ||
                !Number.isInteger(record.nextScenarioSlot) || record.nextScenarioSlot < 0 ||
                !Number.isInteger(record.masterSeed) || record.masterSeed < 0 || record.masterSeed > 0xffffffff ||
                typeof record.boardSetVersion !== 'string' || !Array.isArray(record.candidateArchive) ||
                !Array.isArray(record.champions) || !isObject(record.trainingProfile)) {
                throw new Error('Malformed Schema 1 Gen6 training-state record.');
            }
        } else {
            throw new Error('Malformed Schema 1 Gen6 record: unsupported format.');
        }
        return record;
    }

    function rejectLegacyInput(input) {
        if (typeof input === 'string' || !input || typeof input !== 'object' || input.schemaVersion !== 1) {
            throw new Error('Unsupported legacy Gen6 NEAT data.');
        }
        if (Object.prototype.hasOwnProperty.call(input, 'inputCount') ||
            Object.prototype.hasOwnProperty.call(input, 'genotype') ||
            Object.prototype.hasOwnProperty.call(input, 'population')) {
            throw new Error('Malformed Schema 1 Gen6 data: legacy NEAT fields are not supported.');
        }
        return assertSchema1Record(input);
    }

    function rejectLegacyStorage(storage) {
        if (!storage) return [];
        if (!Number.isInteger(storage.length) || typeof storage.key !== 'function') {
            throw new TypeError('Gen6 storage must support key enumeration.');
        }

        var found = [];
        for (var index = 0; index < storage.length; index++) {
            var key = storage.key(index);
            if (LEGACY_KEYS.indexOf(key) !== -1) found.push(key);
        }
        if (found.length) {
            throw new Error('Unsupported legacy Gen6 localStorage data: ' + found.join(', ') + '.');
        }
        return found;
    }

    var compatibility = {
        assertSchema1Record: assertSchema1Record,
        rejectLegacyInput: rejectLegacyInput,
        rejectLegacyStorage: rejectLegacyStorage,
        LEGACY_KEYS: LEGACY_KEYS.slice(),
        TENSOR_SHAPES: TENSOR_SHAPES.map(function(item) { return [item[0], item[1].slice()]; }),
        PARAMETER_COUNT: PARAMETER_COUNT,
        TILE_KINDS: TILE_KINDS.slice(),
        encodeTileKind: encodeTileKind,
        normalizeCardCount: normalizeCardCount,
        encodeTradeCardTransfer: encodeTradeCardTransfer,
        jailActionMask: jailActionMask,
        encodeJailCardCandidateKey: encodeJailCardCandidateKey
    };

    global.Gen6Schema1Compatibility = compatibility;
    if (typeof module !== 'undefined' && module.exports) module.exports = compatibility;
})(typeof window !== 'undefined' ? window : globalThis);
