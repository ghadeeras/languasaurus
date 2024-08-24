import * as streams from './streams.js'
import * as regex from './regex.js'

export interface TokenType<T> {

    pattern: regex.RegEx

    parse(lexeme: string): T

    token(lexeme: string, position: streams.StreamPosition): Token<T>

    parsedAs(parser: (lexeme: string) => T): TokenType<T>

}

class TokenTypeImpl<T> implements TokenType<T> {

    constructor(
        readonly pattern: regex.RegEx,
        private readonly parser: (lexeme: string) => T
    ) {
        if (pattern.automaton.isOptional) {
            throw new Error("Token types cannot have patterns that match empty strings")
        }
    }

    parse(lexeme: string): T {
        return this.parser(lexeme)
    }

    token(lexeme: string, position: streams.StreamPosition): Token<T> {
        return new Token(this, lexeme, position)
    }

    parsedAs(parser: (lexeme: string) => T): TokenType<T> {
        return new TokenTypeImpl(this.pattern, parser)
    }

}

export function textualToken(pattern: regex.RegEx): TokenType<string> {
    return new TokenTypeImpl(pattern, s => s)
}

export function floatToken(pattern: regex.RegEx): TokenType<number> {
    return new TokenTypeImpl(pattern, s => Number.parseFloat(s))
}

export function integerToken(pattern: regex.RegEx): TokenType<number> {
    return new TokenTypeImpl(pattern, s => Number.parseInt(s))
}

export function booleanToken(pattern: regex.RegEx): TokenType<boolean> {
    return new TokenTypeImpl(pattern, s => s === "true")
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
