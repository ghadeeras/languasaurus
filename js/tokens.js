class TokenTypeImpl {
    constructor(pattern, parser) {
        this.pattern = pattern;
        this.parser = parser;
        if (pattern.automaton.isOptional) {
            throw new Error("Token types cannot have patterns that match empty strings");
        }
    }
    parse(lexeme) {
        return this.parser(lexeme);
    }
    token(lexeme, position) {
        return new Token(this, lexeme, position);
    }
    parsedAs(parser) {
        return new TokenTypeImpl(this.pattern, parser);
    }
}
export class TextualTokenType extends TokenTypeImpl {
    constructor(pattern) {
        super(pattern, s => s);
    }
}
export class FloatTokenType extends TokenTypeImpl {
    constructor(pattern) {
        super(pattern, s => Number.parseFloat(s));
    }
}
export class IntegerTokenType extends TokenTypeImpl {
    constructor(pattern) {
        super(pattern, s => Number.parseInt(s));
    }
}
export class BooleanTokenType extends TokenTypeImpl {
    constructor(pattern) {
        super(pattern, s => pattern.matches(s));
    }
}
export class Token {
    constructor(tokenType, lexeme, position) {
        this.tokenType = tokenType;
        this.lexeme = lexeme;
        this.position = position;
        this.value = tokenType.parse(lexeme);
    }
}
//# sourceMappingURL=tokens.js.map