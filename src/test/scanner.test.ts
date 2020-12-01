import * as scanner from '../prod/scanner.js'
import * as streams from '../prod/streams.js'
import * as tokens from '../prod/tokens.js'
import * as regex from '../prod/regex.js'
import { expect } from 'chai'

class MyScanner extends scanner.Scanner {

    readonly shortKeyWord: tokens.BooleanTokenType    
    readonly longKeyWord: tokens.BooleanTokenType    

    readonly opEq: tokens.BooleanTokenType
    readonly opSoEq: tokens.BooleanTokenType
    readonly opNotEq: tokens.BooleanTokenType

    readonly identifier: tokens.TextualTokenType
    readonly intNum: tokens.IntegerTokenType
    readonly floatNum: tokens.FloatTokenType

    readonly comment: tokens.TextualTokenType
    readonly ws: tokens.TextualTokenType
    
    constructor() {
        super()
        this.shortKeyWord = this.keyword("fun")
        this.longKeyWord = this.keyword("function")

        this.opEq = this.op("=")
        this.opSoEq = this.op("===")
        this.opNotEq = this.op("!=")

        this.identifier = this.string(regex.concat(
            regex.inRanges("a-z", "A-Z"),
            regex.zeroOrMore(regex.inRanges("a-z", "A-Z", "0-9"))
        ))
        this.intNum = this.integer(regex.oneOrMore(regex.inRange("0-9")))
        this.floatNum = this.float(regex.concat(
            regex.zeroOrMore(regex.inRange("0-9")),
            regex.oneOf(".").optional(),
            regex.oneOrMore(regex.inRange("0-9"))
        ))

        this.comment = this.string(regex.concat(
            regex.word("{"),
            regex.zeroOrMore(regex.noneOf("{}")),
            regex.word("}"),
        ))
        this.ws = this.string(regex.oneOrMore(regex.oneOf(" \t\r\n")))
    }

}

describe("Scanner", () => {

    const myScanner = new MyScanner()

    it("produces no tokens (other than EOF) for empty strings", () => {
        const result = tokenize("")

        expect(result).to.be.empty
    })

    it("produces one token for strings with one token only", () => {
        const [eq] = tokenize("=")
        const [notEq] = tokenize("!=")

        expect(eq.tokenType).to.equal(myScanner.opEq)
        expect(eq.lexeme).to.equal("=")

        expect(notEq.tokenType).to.equal(myScanner.opNotEq)
        expect(notEq.lexeme).to.equal("!=")    
    })

    it("matches longest token possible", () => {
        const [id, ws, float] = tokenize("funstuff\n\r123.456")

        expect(id.tokenType).to.equal(myScanner.identifier)
        expect(id.lexeme).to.equal("funstuff") 

        expect(ws.tokenType).to.equal(myScanner.ws)
        expect(ws.lexeme).to.equal("\n\r") 

        expect(float.tokenType).to.equal(myScanner.floatNum)
        expect(float.value).to.equal(123.456) 
    })

    it("disambiguates by order of precedence", () => {
        const [int, fun] = tokenize("123456function")
        expect(myScanner.floatNum.pattern.matches(int.lexeme)).to.be.true 
        expect(myScanner.identifier.pattern.matches(fun.lexeme)).to.be.true 

        expect(int.tokenType).to.equal(myScanner.intNum)
        expect(int.value).to.equal(123456) 
        expect(fun.tokenType).to.equal(myScanner.longKeyWord)
        expect(fun.lexeme).to.equal("function") 
    })

    it("continues parsing just after last recognized token if dead end was reached while trying longest match", () => {
        const [eq1, eq2, notEq] = tokenize("==!=")

        expect(eq1.tokenType).to.equal(myScanner.opEq)
        expect(eq2.tokenType).to.equal(myScanner.opEq)
        expect(notEq.tokenType).to.equal(myScanner.opNotEq)
    })

    it("produces error token from unmatched tokens", () => {
        const [err] = tokenize("@#$%^&}")

        expect(err.tokenType).to.equal(myScanner.errorType)
        expect(err.lexeme).to.equal("@#$%^&}")
    })

    it("produces error token from patially matched token and continues parsing from offending character", () => {
        const [err, comment] = tokenize("{ { }")

        expect(err.tokenType).to.equal(myScanner.errorType)
        expect(err.lexeme).to.equal("{ ")
        expect(comment.tokenType).to.equal(myScanner.comment)
        expect(comment.lexeme).to.equal("{ }")
    })

    it("produces error token from mismatched characters and continues parsing from first matching character", () => {
        const [err, comment] = tokenize("@#$%^&}{ <-- rubbish }")

        expect(err.tokenType).to.equal(myScanner.errorType)
        expect(err.lexeme).to.equal("@#$%^&}")
        expect(comment.tokenType).to.equal(myScanner.comment)
        expect(comment.lexeme).to.equal("{ <-- rubbish }")
    })

    it("produces error token for incomplete tokens cut short by an EOF", () => {
        const [comment, err] = tokenize("{ incomplete --> }{ ...eof")

        expect(comment.tokenType).to.equal(myScanner.comment)
        expect(comment.lexeme).to.equal("{ incomplete --> }")
        expect(err.tokenType).to.equal(myScanner.errorType)
        expect(err.lexeme).to.equal("{ ...eof")
    })

    function tokenize(text: string): tokens.Token<any>[] {
        const stream = new streams.TextInputStream(text)
        const result: tokens.Token<any>[] = []
        for (let token of myScanner.iterator(stream)) {
            result.push(token)
        }
        expect(result.pop()?.tokenType).to.equal(myScanner.eofType)
        return result
    }
    
})
