import * as tokens from './tokens.js';
import * as automaton from './automata.js';
import * as regex from './regex.js';
import * as utils from './utils.js';
export class Scanner {
    constructor() {
        this.errorTokenType = tokens.textualToken(regex.oneOrMore(regex.charIn("\u0000-\uffff")));
        this.eofTokenType = tokens.booleanToken(regex.word("EOF")).parsedAs(lexeme => true);
        this.tokenTypes = [];
        this._tokenTypeNames = new Map();
        this._automaton = null;
    }
    define(tokenType) {
        return new TokenTypeWrapper(tokenType, this.tokenTypes);
    }
    get automaton() {
        if (this._automaton == null) {
            const automata = this.tokenTypes.map(t => t.pattern.automaton.map(() => t));
            const a = automaton.Automaton.choice(automata[0], ...automata.splice(1)).deterministic();
            this._automaton = a.mapStates(s => s.recognizables.length > 0 ?
                automaton.state(this.tieBreak(s.recognizables)) :
                automaton.state());
        }
        return this._automaton;
    }
    tieBreak(tokensTypes) {
        if (tokensTypes.length == 1) {
            return tokensTypes[0];
        }
        const index = tokensTypes
            .map(t => t instanceof TokenTypeWrapper ? t.index : utils.bug())
            .reduce((i1, i2) => i1 < i2 ? i1 : i2);
        return this.tokenTypes[index];
    }
    get tokenTypeNames() {
        this.initTokenNames();
        return [...this._tokenTypeNames.values()];
    }
    tokenTypeName(tokenType) {
        this.initTokenNames();
        return this._tokenTypeNames.get(tokenType);
    }
    initTokenNames() {
        if (this._tokenTypeNames.size == 0) {
            this._tokenTypeNames.set(this.errorTokenType, "ERROR");
            this._tokenTypeNames.set(this.eofTokenType, "EOF");
            for (const key in this) {
                const value = this[key];
                if (value instanceof TokenTypeWrapper) {
                    this._tokenTypeNames.set(value, key);
                }
            }
        }
    }
    string(pattern) {
        return this.define(tokens.textualToken(pattern));
    }
    float(pattern) {
        return this.define(tokens.floatToken(pattern));
    }
    integer(pattern) {
        return this.define(tokens.integerToken(pattern));
    }
    boolean(pattern) {
        return this.define(tokens.booleanToken(pattern));
    }
    keyword(word) {
        return this.boolean(regex.word(word)).parsedAs(lexeme => true);
    }
    op(op) {
        return this.boolean(regex.word(op)).parsedAs(lexeme => true);
    }
    delimiter(del) {
        return this.boolean(regex.word(del)).parsedAs(lexeme => true);
    }
    *iterator(stream) {
        const matcher = new ScanningMatcher(this.automaton.newMatcher());
        while (stream.hasMoreSymbols()) {
            yield this.next(stream, matcher);
        }
        yield this.eofTokenType.token("EOF", stream.position());
    }
    nextToken(stream) {
        const matcher = new ScanningMatcher(this.automaton.newMatcher());
        return stream.hasMoreSymbols() ?
            this.next(stream, matcher) :
            this.eofTokenType.token("EOF", stream.position());
    }
    randomToken(shortness = 0.1) {
        var _a;
        const matcher = this.automaton.newMatcher();
        const index = utils.randomInt(this.tokenTypes.length);
        const tokenType = this.tokenTypes[index];
        const lexeme = tokenType.pattern.randomString(shortness);
        for (let i = 0; i < lexeme.length; i++) {
            (_a = matcher.match(lexeme.charCodeAt(i))) !== null && _a !== void 0 ? _a : utils.bug();
        }
        return matcher.recognized[0].token(lexeme, {
            line: 1,
            column: 1,
            index: 1
        });
    }
    next(stream, matcher) {
        const position = stream.position();
        const [recognizables, lexeme] = matcher.nextToken(stream);
        return recognizables.length > 0 ?
            recognizables[0].token(lexeme, position) :
            this.errorTokenType.token(lexeme, position);
    }
}
const stateStart = 0; // No characters were consumed yet.
const stateConsumingGoodChars = 1; // Potentially consuming characters of a good token.
const stateRecognizing = 2; // Matched a good token! But maybe a longer one could be matched.
const stateConsumingBadChars = 3; // Consuming bad characters to be output as an error token. 
class ScanningMatcher {
    constructor(matcher) {
        this.matcher = matcher;
        this.lexeme = "";
        this.consumedChars = "";
        this.state = stateStart;
    }
    nextToken(stream) {
        this.lexeme = "";
        this.consumedChars = "";
        this.state = stateStart;
        this.matcher.reset();
        stream.mark();
        while (stream.hasMoreSymbols()) {
            // Look-ahead symbol
            stream.mark();
            const symbol = stream.readNextSymbol();
            const doesMatch = this.matcher.match(symbol);
            const doesRecognize = this.matcher.recognized.length > 0;
            if (this.state == stateStart) {
                this.state = doesMatch ? stateConsumingGoodChars : stateConsumingBadChars;
            }
            if (doesMatch != (this.state == stateConsumingBadChars)) { // '!=' is equivalent to xor
                // Consume look-ahead symbol
                stream.unmark();
                this.consumedChars += String.fromCharCode(symbol);
                if (doesRecognize) {
                    this.state = stateRecognizing;
                    this.recognizeConsumedChars(stream);
                }
            }
            else {
                // Return look-ahead symbol to the stream 
                stream.reset();
                break;
            }
        }
        if (this.state != stateRecognizing) {
            // Loop ended before recognizing anything =>
            // Recognize consumed characters as an error token.
            this.matcher.reset();
            this.recognizeConsumedChars(stream);
        }
        stream.reset();
        return [this.matcher.lastRecognized, this.lexeme];
    }
    recognizeConsumedChars(stream) {
        this.lexeme += this.consumedChars;
        this.consumedChars = "";
        stream.unmark();
        stream.mark();
    }
}
class TokenTypeWrapper {
    constructor(tokenType, array, index = array.length) {
        this.tokenType = tokenType;
        this.array = array;
        this.index = index;
        if (0 <= index && index < array.length) {
            array[index] = this;
        }
        else if (index == array.length) {
            array.push(this);
        }
        else {
            utils.bug();
        }
    }
    get pattern() {
        return this.tokenType.pattern;
    }
    parse(lexeme) {
        return this.tokenType.parse(lexeme);
    }
    stringify(value) {
        return this.tokenType.stringify(value);
    }
    token(lexeme, position) {
        return new tokens.Token(this, lexeme, position);
    }
    parsedAs(parser) {
        return new TokenTypeWrapper(this.tokenType.parsedAs(parser), this.array, this.index);
    }
    serializedAs(serializer) {
        return new TokenTypeWrapper(this.tokenType.serializedAs(serializer), this.array, this.index);
    }
}
