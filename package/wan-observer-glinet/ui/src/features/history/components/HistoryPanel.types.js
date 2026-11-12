/**
 * HistoryPanelProps is an explicit view input contract, not a Vue instance.
 * @typedef {object} HistoryPanelProps
 * @property {object} report
 * @property {object} config
 * @property {object} time
 * @property {object} payload
 * @property {number} days
 * @property {{down:number,up:number,quality:number}} active
 * @property {Record<string, number>} widths
 * @property {boolean} showAll
 * @property {boolean} issuesOnly
 * @property {() => void} openExport
 * @property {(days:number) => void} setPeriod
 * @property {(key:string,index:number) => void} pick
 * @property {() => void} toggleShowAll
 * @property {(value:boolean) => void} setIssuesOnly
 */

module.exports = {};
