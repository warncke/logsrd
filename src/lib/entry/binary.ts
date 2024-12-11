export default class Binary {
    dataView: DataView

    constructor(dataView: DataView) {
        this.dataView = dataView
    }

    static fromDataView(dataView: DataView) {
        return new Binary(dataView)
    }
}