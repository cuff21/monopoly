/**
 * PopulationLoader for MonopolyNEAT Gen6 AI
 * Parses and exports population text strings and files.
 */
(function(global) {
    'use strict';

    var PopulationModule = (typeof module !== 'undefined' && module.exports) ? require('../neat/population') : global.NEATPopulation;
    var Population = PopulationModule.Population;

    var PopulationLoader = {
        /**
         * Loads a population from MonopolyNEAT .txt string format.
         * @param {string} text
         * @returns {Population}
         */
        fromString: function(text) {
            return Population.loadFromString(text);
        },

        /**
         * Loads a population from a Base64-encoded string.
         * @param {string} base64Str
         * @returns {Population}
         */
        fromBase64: function(base64Str) {
            var rawText;
            if (typeof atob !== 'undefined') {
                rawText = atob(base64Str.replace(/\s/g, ''));
            } else if (typeof Buffer !== 'undefined') {
                rawText = Buffer.from(base64Str.replace(/\s/g, ''), 'base64').toString('utf8');
            } else {
                throw new Error("No Base64 decoder available in current environment");
            }
            return PopulationLoader.fromString(rawText);
        },

        /**
         * Asynchronously loads a population from an HTML5 File object (e.g. from <input type="file">).
         * @param {File} file
         * @returns {Promise<Population>}
         */
        fromFile: function(file) {
            return new Promise(function(resolve, reject) {
                var reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        var text = e.target.result;
                        var pop = PopulationLoader.fromString(text);
                        resolve(pop);
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = reject;
                reader.readAsText(file);
            });
        },

        /**
         * Triggers a browser file download of the population state as a .txt file.
         * @param {Population} population
         * @param {string} [filename]
         */
        download: function(population, filename) {
            var text = population.saveToString();
            filename = filename || ('monopoly_population_' + population.generation + '.txt');

            if (typeof document !== 'undefined') {
                var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                var link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
            return text;
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PopulationLoader;
    }
    global.PopulationLoader = PopulationLoader;
})(typeof window !== 'undefined' ? window : globalThis);
