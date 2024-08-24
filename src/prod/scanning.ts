import * as streams from './streams.js'
import * as tokens from './tokens.js'
import * as automaton from './automata.js'
import * as regex from './regex.js'
import * as utils from './utils.js'

export class Scanner {

    readonly errorTokenType: tokens.TokenType<string> = tokens.textualToken(regex.oneOrMore(regex.charIn("\u0000-\uffff")))
    readonly eofTokenType: tokens.TokenType<boolean> = tokens.booleanToken(regex.word("EOF")).parsedAs(lexeme => true)

    private readonly tokenTypes: TokenTypeWrapper<any>[] = []
    private readonly _tokenTypeNames: Map<tokens.TokenType<any>, string> = new Map()
    
    private _automaton: automaton.Automaton<tokens.TokenType<any>> | null = null

    private define<T>(tokenType: tokens.TokenType<T>): tokens.TokenType<T> {
        return new TokenTypeWrapper(tokenType, this.tokenTypes)
    }
    
    private get automaton() {
        if (this._automaton == null) {
            const automata = this.tokenTypes.map(t => t.pattern.automaton.map(() => t))
            const a = automaton.Automaton.choice(automata[0], ...automata.splice(1)).deterministic()
            this._automaton = a.mapStates(s => s.recognizables.length > 0 ? 
                automaton.state(this.tieBreak(s.recognizables)) : 
                automaton.state()
            )
        }
        return this._automaton
    }

    protected tieBreak(tokensTypes: tokens.TokenType<any>[]) {
        if (tokensTypes.length == 1) {
            return tokensTypes[0]
        }
        const index = tokensTypes
            .map(t => t instanceof TokenTypeWrapper ? t.index : utils.bug<number>())
            .reduce((i1, i2) => i1 < i2 ? i1 : i2)
        return this.tokenTypes[index]
    }

    get tokenTypeNames() {
        this.initTokenNames()
        return [...this._tokenTypeNames.values()]
    }

    tokenTypeName<T>(tokenType: tokens.TokenType<T>) {
        this.initTokenNames()
        return this._tokenTypeNames.get(tokenType)
    }

    private initTokenNames() {
        if (this._tokenTypeNames.size == 0) {
            this._tokenTypeNames.set(this.errorTokenType, "ERROR")
            this._tokenTypeNames.set(this.eofTokenType, "EOF")
            for (const key in this) {
                const value = this[key]
                if (value instanceof TokenTypeWrapper) {
                    this._tokenTypeNames.set(value, key)
                }
            }
        }
    }

    protected string(pattern: regex.RegEx) {
        return this.define(tokens.textualToken(pattern))
    }

    protected float(pattern: regex.RegEx) {
        return this.define(tokens.floatToken(pattern))
    }

    protected integer(pattern: regex.RegEx) {
        return this.define(tokens.integerToken(pattern))
    }

    protected boolean(pattern: regex.RegEx) {
        return this.define(tokens.booleanToken(pattern))
    }

    protected keyword(word: string) {
        return this.boolean(regex.word(word)).parsedAs(lexeme => true)
    }

    protected op(op: string) {
        return this.boolean(regex.word(op)).parsedAs(lexeme => true)
    }

    protected delimiter(del: string) {
        return this.boolean(regex.word(del)).parsedAs(lexeme => true)
    }

    *iterator(stream: streams.InputStream<number>) {
        const matcher = new ScanningMatcher(this.automaton.newMatcher())
        while (stream.hasMoreSymbols()) {
            yield this.next(stream, matcher)
        }
        yield this.eofTokenType.token("EOF", stream.position())
    }
    
    nextToken(stream: streams.InputStream<number>) {
        const matcher = new ScanningMatcher(this.automaton.newMatcher())
        return stream.hasMoreSymbols() ? 
            this.next(stream, matcher) : 
            this.eofTokenType.token("EOF", stream.position())
    }
    
    randomToken(shortness = 0.1) {
        const matcher = this.automaton.newMatcher()
        const index = utils.randomInt(this.tokenTypes.length)
        const tokenType = this.tokenTypes[index]
        const lexeme = tokenType.pattern.randomString(shortness)
        for (let i = 0; i < lexeme.length; i++) {
            matcher.match(lexeme.charCodeAt(i)) ?? utils.bug()
        }
        return matcher.recognized[0].token(lexeme, {
            line: 1,
            column: 1,
            index: 1
        })
    }
    
    private next(stream: streams.InputStream<number>, matcher: ScanningMatcher) {
        const position = stream.position()
        const [recognizables, lexeme] = matcher.nextToken(stream)
        return recognizables.length > 0 ?
            recognizables[0].token(lexeme, position) :
            this.errorTokenType.token(lexeme, position)
    }

}

const stateStart = 0; // No characters were consumed yet.
const stateConsumingGoodChars = 1; // Potentially consuming characters of a good token.
const stateRecognizing = 2; // Matched a good token! But maybe a longer one could be matched.
const stateConsumingBadChars = 3 // Consuming bad characters to be output as an error token. 

class ScanningMatcher {

    private lexeme = ""
    private consumedChars = ""
    private state = stateStart

    constructor(private matcher: automaton.Matcher<tokens.TokenType<any>>) {
    }

    nextToken(stream: streams.InputStream<number>): [tokens.TokenType<any>[], string] {
        this.lexeme = ""
        this.consumedChars = ""
        this.state = stateStart
        this.matcher.reset()
        stream.mark()
        while (stream.hasMoreSymbols()) {
            // Look-ahead symbol
            stream.mark()
            const symbol = stream.readNextSymbol()

            const doesMatch = this.matcher.match(symbol)
            const doesRecognize = this.matcher.recognized.length > 0

            if (this.state == stateStart) {
                this.state = doesMatch ? stateConsumingGoodChars : stateConsumingBadChars
            }
            
            if (doesMatch != (this.state == stateConsumingBadChars)) { // '!=' is equivalent to xor
                // Consume look-ahead symbol
                stream.unmark()
                this.consumedChars += String.fromCharCode(symbol)

                if (doesRecognize) {
                    this.state = stateRecognizing
                    this.recognizeConsumedChars(stream)
                } 
            } else {
                // Return look-ahead symbol to the stream 
                stream.reset()
                break
            }
        }
        if (this.state != stateRecognizing) {
            // Loop ended before recognizing anything =>
            // Recognize consumed characters as an error token.
            this.matcher.reset()
            this.recognizeConsumedChars(stream)
        }
        stream.reset()
        return [this.matcher.lastRecognized, this.lexeme]
    }
    
    private recognizeConsumedChars(stream: streams.InputStream<number>) {
        this.lexeme += this.consumedChars
        this.consumedChars = ""
        stream.unmark()
        stream.mark()
    }

}

class TokenTypeWrapper<T> implements tokens.TokenType<T> {

    constructor(private tokenType: tokens.TokenType<T>, private array: tokens.TokenType<T>[], readonly index: number = array.length) {
        if (0 <= index && index < array.length) {
            array[index] = this
        } else if (index == array.length) {
            array.push(this)
        } else {
            utils.bug()
        }
    }

    get pattern(): regex.RegEx {
        return this.tokenType.pattern
    }
    
    parse(lexeme: string): T {
        return this.tokenType.parse(lexeme)
    }
    
    token(lexeme: string, position: streams.StreamPosition): tokens.Token<T> {
        return new tokens.Token(this, lexeme, position)
    }

    parsedAs(parser: (lexeme: string) => T): tokens.TokenType<T> {
        return new TokenTypeWrapper(this.tokenType.parsedAs(parser), this.array, this.index)
    }
    
}
