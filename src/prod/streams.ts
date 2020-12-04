import * as utils from './utils.js'

export type StreamPosition = {

    readonly index: number
    readonly line: number
    readonly column: number

}

export interface InputStream<T> {

    position(): StreamPosition

    hasMoreSymbols(): boolean

    readNextSymbol(): T

    mark(): void

    unmark(): void

    reset(): void

}

export class TextInputStream implements InputStream<number> {

    private readonly markedPositions: StreamPosition[] = []
    
    private index: number = 0
    private line: number = 1
    private column: number = 1
    
    constructor(private text: string) {
    }

    position() {
        return  {
            index: this.index,
            line: this.line,
            column: this.column,
        }
    }

    hasMoreSymbols() {
        return this.index < this.text.length
    }

    readNextSymbol() {
        return this.hasMoreSymbols() ? this.consumeNextSymbol() : 0
    }

    private consumeNextSymbol() {
        const symbol = this.text.charCodeAt(this.index++)
        if (symbol == '\n'.charCodeAt(0)) {
            this.line++
            this.column = 1
        } else if (symbol != '\r'.charCodeAt(0)) {
            this.column++
        }
        return symbol
    }

    mark() {
        this.markedPositions.push(this.position())
    }

    unmark() {
        if (this.markedPositions.length > 0) {
            this.markedPositions.pop()
        }
    }

    reset() {
        if (this.markedPositions.length > 0) {
            const markedPosition: StreamPosition = this.markedPositions.pop() ?? utils.bug()
            this.index = markedPosition.index
            this.line = markedPosition.line
            this.column = markedPosition.column
        }
    }

}
