import * as streams from '../prod/streams.js'
import * as tokens from '../prod/tokens.js'
import * as regex from '../prod/regex.js'
import { Scanner } from '../prod/scanning.js'
import { expect } from 'chai'

const defs = {
    shortKeyWord: tokens.keyword("fun"),
    longKeyWord: tokens.keyword("function"),    

    opEq: tokens.op("="),
    opSoEq: tokens.op("==="),
    opNotEq: tokens.op("!="),

    identifier: tokens.string(regex.concat(
        regex.charIn("a-z", "A-Z"),
        regex.zeroOrMore(regex.charIn("a-z", "A-Z", "0-9"))
    )).parsedAs(s => s.toUpperCase()),
    intNum: tokens.integer(regex.oneOrMore(regex.charIn("0-9"))),
    floatNum: tokens.float(regex.concat(
        regex.zeroOrMore(regex.charIn("0-9")),
        regex.charFrom(".").optional(),
        regex.oneOrMore(regex.charIn("0-9"))
    )),

    comment: tokens.string(regex.concat(
        regex.word("{"),
        regex.zeroOrMore(regex.charNotFrom("{}")),
        regex.word("}"),
    )),
    ws: tokens.string(regex.oneOrMore(regex.charFrom(" \t\r\n"))),
}

const myScanner = new Scanner(defs)

describe("Scanner", () => {

    it("names the declared token types", () => {
        const s = myScanner
        expect(s.tokenTypeName(defs.shortKeyWord)).to.equal("shortKeyWord")
        expect(s.tokenTypeName(defs.longKeyWord)).to.equal("longKeyWord")
        expect(s.tokenTypeName(defs.opEq)).to.equal("opEq")
        expect(s.tokenTypeName(defs.opSoEq)).to.equal("opSoEq")
        expect(s.tokenTypeName(defs.opNotEq)).to.equal("opNotEq")
        expect(s.tokenTypeName(defs.identifier)).to.equal("identifier")
        expect(s.tokenTypeName(defs.intNum)).to.equal("intNum")
        expect(s.tokenTypeName(defs.floatNum)).to.equal("floatNum")
        expect(s.tokenTypeName(defs.comment)).to.equal("comment")
        expect(s.tokenTypeName(defs.ws)).to.equal("ws")

        expect(s.tokenTypeNames.sort()).to.deep.equal([
            "ERROR",
            "EOF",
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

        expect(eq.tokenType).to.equal(defs.opEq)
        expect(eq.lexeme).to.equal("=")

        expect(notEq.tokenType).to.equal(defs.opNotEq)
        expect(notEq.lexeme).to.equal("!=")    
    })

    it("matches longest token possible", () => {
        const [id, ws, float] = tokenize("funStuff\n\r123.456")

        expect(id.tokenType).to.equal(defs.identifier)
        expect(id.lexeme).to.equal("funStuff") 

        expect(ws.tokenType).to.equal(defs.ws)
        expect(ws.lexeme).to.equal("\n\r") 

        expect(float.tokenType).to.equal(defs.floatNum)
        expect(float.value).to.equal(123.456) 
    })

    it("removes ambiguities by order of precedence", () => {
        const [int, fun] = tokenize("123456function")
        expect(defs.floatNum.pattern.matches(int.lexeme)).to.be.true 
        expect(defs.identifier.pattern.matches(fun.lexeme)).to.be.true 

        expect(int.tokenType).to.equal(defs.intNum)
        expect(int.value).to.equal(123456) 
        expect(fun.tokenType).to.equal(defs.longKeyWord)
        expect(fun.lexeme).to.equal("function") 
    })

    it("continues parsing just after last recognized token if dead end was reached while trying longest match", () => {
        const [eq1, eq2, notEq] = tokenize("==!=")

        expect(eq1.tokenType).to.equal(defs.opEq)
        expect(eq2.tokenType).to.equal(defs.opEq)
        expect(notEq.tokenType).to.equal(defs.opNotEq)
    })

    it("produces error token from unmatched tokens", () => {
        const [err] = tokenize("@#$%^&}")

        expect(err.tokenType).to.equal(tokens.error)
        expect(err.lexeme).to.equal("@#$%^&}")
    })

    it("produces error token from partially matched token and continues parsing from offending character", () => {
        const [err, comment] = tokenize("{ { }")

        expect(err.tokenType).to.equal(tokens.error)
        expect(err.lexeme).to.equal("{ ")
        expect(comment.tokenType).to.equal(defs.comment)
        expect(comment.lexeme).to.equal("{ }")
    })

    it("produces error token from mismatched characters and continues parsing from first matching character", () => {
        const [err, comment] = tokenize("@#$%^&{ <-- rubbish }")

        expect(err.tokenType).to.equal(tokens.error)
        expect(err.lexeme).to.equal("@#$%^&")
        expect(comment.tokenType).to.equal(defs.comment)
        expect(comment.lexeme).to.equal("{ <-- rubbish }")
    })

    it("produces error token from trailing mismatched characters", () => {
        const [comment, err] = tokenize("{ rubbish --> }@#$%^&")

        expect(comment.tokenType).to.equal(defs.comment)
        expect(comment.lexeme).to.equal("{ rubbish --> }")
        expect(err.tokenType).to.equal(tokens.error)
        expect(err.lexeme).to.equal("@#$%^&")
    })

    it("produces error token from mismatched characters and continues parsing from first matching (and recognizing) character", () => {
        const [err, comment] = tokenize(":hello")

        expect(err.tokenType).to.equal(tokens.error)
        expect(err.lexeme).to.equal(":")
        expect(comment.tokenType).to.equal(defs.identifier)
        expect(comment.lexeme).to.equal("hello")
    })

    it("produces error token for incomplete tokens cut short by an EOF", () => {
        const [comment, err] = tokenize("{ incomplete --> }{ ...eof")

        expect(comment.tokenType).to.equal(defs.comment)
        expect(comment.lexeme).to.equal("{ incomplete --> }")
        expect(err.tokenType).to.equal(tokens.error)
        expect(err.lexeme).to.equal("{ ...eof")
    })

    function tokenize(text: string): tokens.Token<any>[] {
        const stream = new streams.TextInputStream(text)
        const result: tokens.Token<any>[] = []
        for (const token of myScanner.iterator(stream)) {
            result.push(token)
        }
        expect(result.pop()?.tokenType).to.equal(tokens.eof)
        return result
    }
    
})
