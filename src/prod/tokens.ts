import * as streams from './streams.js'
import * as regex from './regex.js'

export interface TokenType<T> {

    pattern: regex.RegEx

    parse(lexeme: string): T

    token(lexeme: string, position: streams.StreamPosition): Token<T>

    parsedAs(parser: (lexeme: string) => T): TokenType<T>

}

class TokenTypeImpl<T> implements TokenType<T> {

    protected constructor(
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

export class TextualTokenType extends TokenTypeImpl<string> {
    
    constructor(pattern: regex.RegEx) {
        super(pattern, s => s)
    }

}

export class FloatTokenType extends TokenTypeImpl<number> {
    
    constructor(pattern: regex.RegEx) {
        super(pattern, s => Number.parseFloat(s))
    }

}

export class IntegerTokenType extends TokenTypeImpl<number> {
    
    constructor(pattern: regex.RegEx) {
        super(pattern, s => Number.parseInt(s))
    }

}

export class BooleanTokenType extends TokenTypeImpl<boolean> {
    
    constructor(pattern: regex.RegEx) {
        super(pattern, s => pattern.matches(s))
    }

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
