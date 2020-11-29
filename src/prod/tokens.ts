import * as streams from './streams'
import * as regex from './regex'

export class TokenType<T> {

    constructor(
        readonly pattern: regex.RegEx,
        readonly parser: (lexeme: string) => T
    ) {
        if (pattern.optional()) {
            throw new Error("Token types cannot have patterns that match empty strings")
        }
        for (let i = 0; i < 100; i++) {
            this.testParser(pattern, parser)
        }
    }

    token(lexeme: string, position: streams.StreamPosition): Token<T> {
        return new Token(this, lexeme, position)
    }

    private testParser(pattern: regex.RegEx, parser: (lexeme: string) => T) {
        const lexeme = pattern.random()
        try {
            parser(lexeme)
        } catch (e) {
            throw new Error("Supplied parser failed to parse a valid lexeme like: " + lexeme)
        }
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
