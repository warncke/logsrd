import LogConfig from "./log-config";
import Persist from "./persist";

export default class PersistLog {
    config: LogConfig
    persist: Persist

    constructor({
        config,
        persist,
    } : {
        config: LogConfig,
        persist: Persist
    }) {
        this.config = config
        this.persist = persist
        
    }
}
