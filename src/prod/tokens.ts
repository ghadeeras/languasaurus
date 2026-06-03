import * as streams from './streams.js'
import * as regex from './regex.js'

export interface TokenType<T> {

    pattern: regex.RegEx

    parse(lexeme: string): T

    stringify(value: T): string

    token(lexeme: string, position: streams.StreamPosition): Token<T>

    parsedAs(parser: (lexeme: string) => T): TokenType<T>

    serializedAs(serializer: (value: T) => string): TokenType<T>

}

class TokenTypeImpl<T> implements TokenType<T> {

    constructor(
        readonly pattern: regex.RegEx,
        private readonly parser: (lexeme: string) => T,
        private readonly serializer: (value: T) => string,
    ) {
        if (pattern.automaton.isOptional) {
            throw new Error("Token types cannot have patterns that match empty strings")
        }
    }

    parse(lexeme: string): T {
        return this.parser(lexeme)
    }

    stringify(value: T): string {
        return this.serializer(value)
    }

    token(lexeme: string, position: streams.StreamPosition): Token<T> {
        return new Token(this, lexeme, position)
    }

    parsedAs(parser: (lexeme: string) => T): TokenType<T> {
        return new TokenTypeImpl(this.pattern, parser, this.serializer)
    }

    serializedAs(serializer: (value: T) => string): TokenType<T> {
        return new TokenTypeImpl(this.pattern, this.parser, serializer)
    }

}

export const error: TokenType<Error> = new TokenTypeImpl(regex.charNotIn("\u0000-\uffff"), s => new Error(s), s => s.message)

export const eof: TokenType<null> = new TokenTypeImpl(regex.char("\u0000"), s => null, s => "")

export function string(pattern: regex.RegEx): TokenType<string> {
    return new TokenTypeImpl(pattern, s => s, s => s)
}

export function float(pattern: regex.RegEx): TokenType<number> {
    return new TokenTypeImpl(pattern, s => Number.parseFloat(s), n => n.toString())
}

export function integer(pattern: regex.RegEx): TokenType<number> {
    return new TokenTypeImpl(pattern, s => Number.parseInt(s), n => n.toFixed(0))
}

export function boolean(pattern: regex.RegEx): TokenType<boolean> {
    return new TokenTypeImpl(pattern, s => s === "true", b => b ? "true" : "false")
}

export function keyword(word: string) {
    return boolean(regex.word(word)).parsedAs(lexeme => true)
}

export function op(op: string) {
    return boolean(regex.word(op)).parsedAs(lexeme => true)
}

export function delimiter(del: string) {
    return boolean(regex.word(del)).parsedAs(lexeme => true)
}

export class Token<T> {

    readonly value: T
    
    constructor(
        readonly tokenType: TokenType<T>,
        readonly lexeme: string,
        readonly position: streams.StreamPosition
    ) {
        this.value = tokenType.parse(lexeme)
    }

}
