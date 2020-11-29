import * as streams from './streams'
import * as tokens from './tokens'
import * as automaton from './automaton'
import * as regex from './regex'
import * as charset from './charset'

export class Scanner {

    private readonly error: tokens.TextualTokenType
    private readonly eof: tokens.BooleanTokenType
    private readonly tokenTypes: tokens.TokenType<any>[]
    private readonly automaton: automaton.Automaton<tokens.TokenType<any>>

    constructor(
        private stream: streams.InputStream<number>,
        ...tokenTypes: tokens.TokenType<any>[]
    ) {
        const automata = tokenTypes.map(t => t.pattern.automaton.map(() => t))
        this.error = new tokens.TextualTokenType(regex.oneOrMore(regex.inRange("\u0000-\uffff")))
        this.eof = new tokens.BooleanTokenType(regex.oneOrMore(regex.word("EOF")))
        this.tokenTypes = tokenTypes
        this.automaton = automaton.Automaton.choice(automata[0], ...automata.splice(1))
    }

    get errorType(): tokens.TextualTokenType {
        return this.error;
    }
    
    get eofType(): tokens.BooleanTokenType {
        return this.eof;
    }
    
    nextToken(): tokens.Token<any> {
        if (!this.stream.hasMoreSymbols()) {
            return this.eof.token("EOF", this.stream.position())
        }
        const position = this.stream.position()
        const matcher = this.automaton.newMatcher()
        let lexeme = ""
        let goodChars = ""
        let badChars = ""
        this.stream.mark()
        while (this.stream.hasMoreSymbols()) {
            const symbol = this.stream.readNextSymbol()
            if (matcher.match(symbol)) {
                // Good char ...
                if (badChars.length == 0) {
                    // ... after good characters => consume character 
                    this.stream.unmark()
                    this.stream.mark()
                    goodChars += String.fromCharCode(symbol)
                    if (matcher.recognized.length > 0) {
                        lexeme += goodChars
                        goodChars = ""
                    } 
                } else {
                    // ... after bad characters => do not consume character & produce bad lexeme 
                    lexeme = badChars
                    break
                }
            } else {
                // Bad char ...
                if (goodChars.length == 0 && lexeme.length == 0) {
                    // ... after bad characters => consume character 
                    this.stream.unmark()
                    this.stream.mark()
                    badChars += String.fromCharCode(symbol)
                } else {
                    // ... after good characters => do not consume character & produce lexeme
                    lexeme = lexeme.length > 0 ? lexeme : goodChars
                    break
                }
            }
        }
        this.stream.reset()
        return badChars.length == 0 && matcher.lastRecognized.length > 0 ?
            this.tieBreak(matcher.lastRecognized.map(t => t.token(lexeme, position))) :
            this.error.token(lexeme, position)
    }

    protected tieBreak(tokens: tokens.Token<any>[]): tokens.Token<any> {
        if (tokens.length == 1) {
            return tokens[0]
        }
        const index = tokens.map(t => this.tokenTypes.indexOf(t.tokenType)).reduce((i1, i2) => i1 < i2 ? i1 : i2)
        const tokenType = this.tokenTypes[index]
        return tokens.find(t => t.tokenType == tokenType) || bug()
    }

}

function bug<T>(): T {
    throw new Error("Should never happen!!!")
}