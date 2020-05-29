import * as streams from './streams.js';
import * as regex from './regex.js';
export interface TokenType<T> {
    pattern: regex.RegEx;
    parse(lexeme: string): T;
    token(lexeme: string, position: streams.StreamPosition): Token<T>;
    parsedAs(parser: (lexeme: string) => T): TokenType<T>;
}
declare class TokenTypeImpl<T> implements TokenType<T> {
    readonly pattern: regex.RegEx;
    private readonly parser;
    protected constructor(pattern: regex.RegEx, parser: (lexeme: string) => T);
    parse(lexeme: string): T;
    token(lexeme: string, position: streams.StreamPosition): Token<T>;
    parsedAs(parser: (lexeme: string) => T): TokenType<T>;
}
export declare class TextualTokenType extends TokenTypeImpl<string> {
    constructor(pattern: regex.RegEx);
}
export declare class FloatTokenType extends TokenTypeImpl<number> {
    constructor(pattern: regex.RegEx);
}
export declare class IntegerTokenType extends TokenTypeImpl<number> {
    constructor(pattern: regex.RegEx);
}
export declare class BooleanTokenType extends TokenTypeImpl<boolean> {
    constructor(pattern: regex.RegEx);
}
export declare class Token<T> {
    readonly tokenType: TokenType<T>;
    readonly lexeme: string;
    readonly position: streams.StreamPosition;
    readonly value: T;
    constructor(tokenType: TokenType<T>, lexeme: string, position: streams.StreamPosition);
}
export {};
//# sourceMappingURL=tokens.d.ts.map