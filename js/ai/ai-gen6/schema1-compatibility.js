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

    function hasValidTensorEnvelope(tensors) {
        if (!Array.isArray(tensors) || tensors.length === 0) return false;
        var names = Object.create(null);
        return tensors.every(function(tensor) {
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
            for (var valueIndex = 0; valueIndex < tensor.values.length; valueIndex++) {
                if (!Number.isFinite(tensor.values[valueIndex])) return false;
            }
            return true;
        });
    }

    function assertSchema1Record(record) {
        if (!record || typeof record !== 'object' || Array.isArray(record) || record.schemaVersion !== 1) {
            throw new Error('Unsupported Gen6 data: schemaVersion 1 is required.');
        }
        if (record.format === 'monopoly-gen6-policy') {
            if (!hasExactFields(record, POLICY_FIELDS) || record.policyId !== 'active' ||
                !hasValidTensorEnvelope(record.tensors) || !isObject(record.validation) || !isObject(record.coverage)) {
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
        LEGACY_KEYS: LEGACY_KEYS.slice()
    };

    global.Gen6Schema1Compatibility = compatibility;
    if (typeof module !== 'undefined' && module.exports) module.exports = compatibility;
})(typeof window !== 'undefined' ? window : globalThis);
