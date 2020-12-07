import * as scanner from '../prod/scanning.js'
import * as streams from '../prod/streams.js'
import * as tokens from '../prod/tokens.js'
import * as regex from '../prod/regex.js'
import { expect } from 'chai'

class MyScanner extends scanner.Scanner {

    readonly shortKeyWord: tokens.TokenType<boolean>    
    readonly longKeyWord: tokens.TokenType<boolean>    

    readonly opEq: tokens.TokenType<boolean>
    readonly opSoEq: tokens.TokenType<boolean>
    readonly opNotEq: tokens.TokenType<boolean>

    readonly identifier: tokens.TokenType<string>
    readonly intNum: tokens.TokenType<number>
    readonly floatNum: tokens.TokenType<number>

    readonly comment: tokens.TokenType<string>
    readonly ws: tokens.TokenType<string>
    
    constructor() {
        super()
        this.shortKeyWord = this.keyword("fun")
        this.longKeyWord = this.keyword("function")

        this.opEq = this.op("=")
        this.opSoEq = this.op("===")
        this.opNotEq = this.op("!=")

        this.identifier = this.string(regex.concat(
            regex.charIn("a-z", "A-Z"),
            regex.zeroOrMore(regex.charIn("a-z", "A-Z", "0-9"))
        )).parsedAs(s => s.toUpperCase())
        this.intNum = this.integer(regex.oneOrMore(regex.charIn("0-9")))
        this.floatNum = this.float(regex.concat(
            regex.zeroOrMore(regex.charIn("0-9")),
            regex.charFrom(".").optional(),
            regex.oneOrMore(regex.charIn("0-9"))
        ))

        this.comment = this.string(regex.concat(
            regex.word("{"),
            regex.zeroOrMore(regex.charNotFrom("{}")),
            regex.word("}"),
        ))
        this.ws = this.string(regex.oneOrMore(regex.charFrom(" \t\r\n")))
    }

}

describe("Scanner", () => {

    const myScanner = new MyScanner()

    it("names the declared token types", () => {
        const s = myScanner
        expect(s.tokenTypeName(s.shortKeyWord)).to.equal("shortKeyWord")
        expect(s.tokenTypeName(s.longKeyWord)).to.equal("longKeyWord")
        expect(s.tokenTypeName(s.opEq)).to.equal("opEq")
        expect(s.tokenTypeName(s.opSoEq)).to.equal("opSoEq")
        expect(s.tokenTypeName(s.opNotEq)).to.equal("opNotEq")
        expect(s.tokenTypeName(s.identifier)).to.equal("identifier")
        expect(s.tokenTypeName(s.intNum)).to.equal("intNum")
        expect(s.tokenTypeName(s.floatNum)).to.equal("floatNum")
        expect(s.tokenTypeName(s.comment)).to.equal("comment")
        expect(s.tokenTypeName(s.ws)).to.equal("ws")

        expect(s.tokenTypeNames.sort()).to.deep.equal([
            "shortKeyWord",
            "longKeyWord",
            "opEq",
            "opSoEq",
            "opNotEq",
            "identifier",
            "intNum",
            "floatNum",
            "comment",
            "ws"
        ].sort())
    })

    it("generates random tokens", () => {
        for (let i = 0; i < 100; i++) {
            const randomToken = myScanner.randomToken()
            const [token] = tokenize(randomToken.lexeme)
            expect(token.tokenType).to.equal(randomToken.tokenType)
        }
    })

    it("parses value as specified", () => {
        const s = "identifiersInThisExampleAreCaseInsensitive"
        const [id] = tokenize(s)
        expect(id.value).to.equal(s.toUpperCase())
    })

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

        expect(err.tokenType).to.equal(myScanner.errorTokenType)
        expect(err.lexeme).to.equal("@#$%^&}")
    })

    it("produces error token from patially matched token and continues parsing from offending character", () => {
        const [err, comment] = tokenize("{ { }")

        expect(err.tokenType).to.equal(myScanner.errorTokenType)
        expect(err.lexeme).to.equal("{ ")
        expect(comment.tokenType).to.equal(myScanner.comment)
        expect(comment.lexeme).to.equal("{ }")
    })

    it("produces error token from mismatched characters and continues parsing from first matching character", () => {
        const [err, comment] = tokenize("@#$%^&{ <-- rubbish }")

        expect(err.tokenType).to.equal(myScanner.errorTokenType)
        expect(err.lexeme).to.equal("@#$%^&")
        expect(comment.tokenType).to.equal(myScanner.comment)
        expect(comment.lexeme).to.equal("{ <-- rubbish }")
    })

    it("produces error token from trailing mismatched characters", () => {
        const [comment, err] = tokenize("{ rubbish --> }@#$%^&")

        expect(comment.tokenType).to.equal(myScanner.comment)
        expect(comment.lexeme).to.equal("{ rubbish --> }")
        expect(err.tokenType).to.equal(myScanner.errorTokenType)
        expect(err.lexeme).to.equal("@#$%^&")
    })

    it("produces error token from mismatched characters and continues parsing from first matching (and recognizing) character", () => {
        const [err, comment] = tokenize(":hello")

        expect(err.tokenType).to.equal(myScanner.errorTokenType)
        expect(err.lexeme).to.equal(":")
        expect(comment.tokenType).to.equal(myScanner.identifier)
        expect(comment.lexeme).to.equal("hello")
    })

    it("produces error token for incomplete tokens cut short by an EOF", () => {
        const [comment, err] = tokenize("{ incomplete --> }{ ...eof")

        expect(comment.tokenType).to.equal(myScanner.comment)
        expect(comment.lexeme).to.equal("{ incomplete --> }")
        expect(err.tokenType).to.equal(myScanner.errorTokenType)
        expect(err.lexeme).to.equal("{ ...eof")
    })

    function tokenize(text: string): tokens.Token<any>[] {
        const stream = new streams.TextInputStream(text)
        const result: tokens.Token<any>[] = []
        for (let token of myScanner.iterator(stream)) {
            result.push(token)
        }
        expect(result.pop()?.tokenType).to.equal(myScanner.eofTokenType)
        return result
    }
    
})
