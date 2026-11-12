/**
 * SettingsDialogProps is an explicit view input contract, not a Vue instance.
 * @typedef {object} SettingsDialogProps
 * @property {Record<string, string | number | boolean>} form
 * @property {object} config
 * @property {Record<string,string>} fieldErrors
 * @property {object} payload
 * @property {boolean} confirmDiscard
 * @property {boolean} submitted
 * @property {string} saveError
 * @property {boolean} saving
 * @property {(force?:boolean) => void} close
 * @property {() => Promise<void>} save
 * @property {(key:string) => void} touch
 * @property {() => void} clearDiscard
 */

module.exports = {};
