import * as streams from './streams.js'
import * as regex from './regex.js'

export interface TokenType<T> {

    pattern: regex.RegEx

    parse(lexeme: string): T

    stringify(value: T): string

    token(lexeme: string, position: streams.StreamPosition): Token<T>

    parsedAs(parser: (lexeme: string) => T): TokenType<T>

    serializedAs(serializer: (value: T) => string): TokenType<T>

    random(position: streams.StreamPosition): Token<T>

    replacing(token: Token<any>): Token<T>

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

    random(position: streams.StreamPosition): Token<T> {
        const lexeme = this.pattern.random()
        return new Token(this, lexeme, position)
    }

    replacing(token: Token<any>): Token<T> {
        const lexeme = this.pattern.random()
        return new Token(this, lexeme, token.position, token)
    }

}

export const error: TokenType<Error> = new TokenTypeImpl(regex.charNotIn("\u0000-\uffff"), s => new Error(s), s => s.message)

export const eof: TokenType<null> = new TokenTypeImpl(regex.word("\u0000EOF\u0000"), s => null, s => "")

export function string(pattern: regex.RegEx): TokenType<string> {
    return new TokenTypeImpl(pattern, s => s, s => s)
}

export function float(pattern: regex.RegEx): TokenType<number> {
    return new TokenTypeImpl(pattern, s => Number.parseFloat(s), n => n.toPrecision())
}

export function integer(pattern: regex.RegEx): TokenType<number> {
    return new TokenTypeImpl(pattern, s => Number.parseInt(s), n => n.toFixed(0))
}

export function boolean(t: string= "true", f: string = "false"): TokenType<boolean> {
    return new TokenTypeImpl(regex.word(t).or(regex.word(f)), s => s === t, b => b ? t : f)
}

export function keyword<T extends string>(word: T) {
    return new TokenTypeImpl(regex.word(word), _ => word, _ => word)
}

export function op(op: string) {
    return keyword(op)
}

export function delimiter(del: string) {
    return keyword(del)
}

export class Token<T> {

    readonly value: T
    
    constructor(
        readonly tokenType: TokenType<T>,
        readonly lexeme: string,
        readonly position: streams.StreamPosition,
        readonly replacedToken: Token<any> | null = null
    ) {
        this.value = tokenType.parse(lexeme)
    }

}
