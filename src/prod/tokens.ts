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

export function textualToken(pattern: regex.RegEx): TokenType<string> {
    return new TokenTypeImpl(pattern, s => s, s => s)
}

export function floatToken(pattern: regex.RegEx): TokenType<number> {
    return new TokenTypeImpl(pattern, s => Number.parseFloat(s), n => n.toString())
}

export function integerToken(pattern: regex.RegEx): TokenType<number> {
    return new TokenTypeImpl(pattern, s => Number.parseInt(s), n => n.toFixed(0))
}

export function booleanToken(pattern: regex.RegEx): TokenType<boolean> {
    return new TokenTypeImpl(pattern, s => s === "true", b => b ? "true" : "false")
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
