import * as streams from './streams.js'
import * as regex from './regex.js'

export class TokenType<T> {

    constructor(
        readonly pattern: regex.RegEx,
        readonly parser: (lexeme: string) => T
    ) {
        if (pattern.automaton.isOptional) {
            throw new Error("Token types cannot have patterns that match empty strings")
        }
    }

    token(lexeme: string, position: streams.StreamPosition) {
        return new Token<T>(this, lexeme, position)
    }

    parsedAs(parser: (lexeme: string) => T) {
        return new TokenType(this.pattern, parser)
    }

}

export class TextualTokenType extends TokenType<string> {
    
    constructor(pattern: regex.RegEx) {
        super(pattern, s => s)
    }

}

export class FloatTokenType extends TokenType<number> {
    
    constructor(pattern: regex.RegEx) {
        super(pattern, s => Number.parseFloat(s))
    }

}

export class IntegerTokenType extends TokenType<number> {
    
    constructor(pattern: regex.RegEx) {
        super(pattern, s => Number.parseInt(s))
    }

}

export class BooleanTokenType extends TokenType<boolean> {
    
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
        this.value = tokenType.parser(lexeme)
    }

}
