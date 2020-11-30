import * as streams from './streams.js'
import * as tokens from './tokens.js'
import * as automaton from './automaton.js'
import * as regex from './regex.js'

export class Scanner {

    readonly errorType: tokens.TextualTokenType = new tokens.TextualTokenType(regex.oneOrMore(regex.inRange("\u0000-\uffff")))
    readonly eofType: tokens.BooleanTokenType = new tokens.BooleanTokenType(regex.oneOrMore(regex.word("EOF")))

    private readonly tokenTypes: tokens.TokenType<any>[] = []
    private readonly tokenTypesPrecedence: Map<tokens.TokenType<any>, number> = new Map()
    
    private automaton: automaton.Automaton<tokens.TokenType<any>> | null = null

    private define<T>(tokenType: tokens.TokenType<T>) {
        this.tokenTypesPrecedence.set(tokenType, this.tokenTypes.length)
        this.tokenTypes.push(tokenType)
        return tokenType
    }
    
    protected string(pattern: regex.RegEx) {
        return this.define(new tokens.TextualTokenType(pattern))
    }

    protected float(pattern: regex.RegEx) {
        return this.define(new tokens.FloatTokenType(pattern))
    }

    protected integer(pattern: regex.RegEx) {
        return this.define(new tokens.IntegerTokenType(pattern))
    }

    protected boolean(pattern: regex.RegEx) {
        return this.define(new tokens.BooleanTokenType(pattern))
    }

    protected keyword(word: string) {
        return this.boolean(regex.word(word))
    }

    protected op(op: string) {
        return this.boolean(regex.word(op))
    }

    protected delimiter(del: string) {
        return this.boolean(regex.word(del))
    }

    *iterator(stream: streams.InputStream<number>) {
        if (this.automaton == null) {
            const automata = this.tokenTypes.map(t => t.pattern.automaton.map(() => t))
            this.automaton = automaton.Automaton.choice(automata[0], ...automata.splice(1)).deterministic()
        }
        const matcher = new ScanningMatcher(this.automaton.newMatcher(), stream)
        while (stream.hasMoreSymbols()) {
            const position = stream.position()
            const [recognizables, lexeme] = matcher.nextToken()
            yield recognizables.length > 0 ?
                this.tieBreak(recognizables).token(lexeme, position) :
                this.errorType.token(lexeme, position)
        }
        yield this.eofType.token("EOF", stream.position())
    }
    
    protected tieBreak(tokensTypes: tokens.TokenType<any>[]) {
        if (tokensTypes.length == 1) {
            return tokensTypes[0]
        }
        const index = tokensTypes
            .map(t => this.tokenTypesPrecedence.get(t) || 0)
            .reduce((i1, i2) => i1 < i2 ? i1 : i2)
        return this.tokenTypes[index]
    }

}

const stateStart = 0;
const stateMatching = 1;
const stateRecognizing = 2;
const stateSkipping = 3

class ScanningMatcher {

    private lexeme = ""
    private consumedChars = ""
    private state = stateStart

    constructor(
        private matcher: automaton.Matcher<tokens.TokenType<any>>, 
        private stream: streams.InputStream<number>
    ) {
    }

    nextToken(): [tokens.TokenType<any>[], string] {
        this.lexeme = ""
        this.consumedChars = ""
        this.state = stateStart
        this.matcher.reset()
        this.stream.mark()
        while (this.stream.hasMoreSymbols()) {
            this.stream.mark()

            const symbol = this.stream.readNextSymbol()
            const doesMatch = this.matcher.match(symbol)
            const doesRecognize = this.matcher.recognized.length > 0

            if (this.state == stateStart) {
                this.state = doesMatch ? stateMatching : stateSkipping
            }
            
            if (doesMatch) {
                if (this.state == stateMatching || this.state == stateRecognizing) {
                    // So far matching characters or maybe recognizing ones are encountered =>
                    // Consume/accumulate the matching characters until a mismatching one is encountered
                    this.stream.unmark()
                    this.consumedChars += String.fromCharCode(symbol)
                    if (doesRecognize) {
                        this.state = stateRecognizing
                        this.recognizeConsumedChars()
                    } 
                } else { 
                    // First matching character after consuming a string of definitely mismatching characters =>
                    // Produce error token, not including the matching character.
                    this.stream.reset()
                    this.recognizeConsumedChars()
                    break
                }
            } else {
                if (this.state == stateSkipping) {
                    // So far mismatching charachters are encountered =>
                    // Consume/accumulate the mismatching characters until a matching one is encountered.
                    this.stream.unmark()
                    this.consumedChars += String.fromCharCode(symbol)
                } else if (this.state == stateMatching) {
                    // First mismatching character after consuming a string of matching, but not-recognizing characters =>
                    // Produce error token, not including the mismatching character (which could be the first of next token).
                    this.stream.reset()
                    this.recognizeConsumedChars()
                    break
                } else {
                    // First mismatching character after consuming a string of matching, some recognizing, characters =>
                    // Produce good token, not including all the characters after the last recognition.
                    this.stream.reset()
                    break
                }
            }
        }
        if (this.state == stateMatching) {
            // Reached EOF before end of token =>
            // Produce error token from consumed matching characters.
            this.recognizeConsumedChars()
        }
        this.stream.reset()
        return [this.matcher.lastRecognized, this.lexeme]
    }
    
    private recognizeConsumedChars() {
        this.lexeme += this.consumedChars
        this.consumedChars = ""
        this.stream.unmark()
        this.stream.mark()
    }

}
