import * as utils from './utils.js';
export class TextInputStream {
    constructor(text) {
        this.text = text;
        this.markedPositions = [];
        this.index = 0;
        this.line = 1;
        this.column = 1;
    }
    position() {
        return {
            index: this.index,
            line: this.line,
            column: this.column,
        };
    }
    hasMoreSymbols() {
        return this.index < this.text.length;
    }
    readNextSymbol() {
        return this.hasMoreSymbols() ? this.consumeNextSymbol() : 0;
    }
    consumeNextSymbol() {
        const symbol = this.text.charCodeAt(this.index++);
        if (symbol == '\n'.charCodeAt(0)) {
            this.line++;
            this.column = 1;
        }
        else if (symbol != '\r'.charCodeAt(0)) {
            this.column++;
        }
        return symbol;
    }
    mark() {
        this.markedPositions.push(this.position());
    }
    unmark() {
        if (this.markedPositions.length > 0) {
            this.markedPositions.pop();
        }
    }
    reset() {
        var _a;
        if (this.markedPositions.length > 0) {
            const markedPosition = (_a = this.markedPositions.pop()) !== null && _a !== void 0 ? _a : utils.bug();
            this.index = markedPosition.index;
            this.line = markedPosition.line;
            this.column = markedPosition.column;
        }
    }
}
