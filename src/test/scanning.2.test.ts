import * as streams from '../prod/streams.js'
import * as tokens from '../prod/tokens.js'
import * as regex from '../prod/regex.js'
import { Scanner } from '../prod/scanning.js'
import { expect } from 'chai'

const defs = {
    arithmeticOperators: tokens.string(regex.charFrom("+-*/")),
    arrows: tokens.string(regex.choice(
        regex.word("-->"),
        regex.word("<--")
    )),
    margins: tokens.string(regex.concat(
        regex.charFrom("|"),
        regex.concat(
            regex.zeroOrMore(regex.charFrom(".")),
            regex.charFrom("|")
        ).optional()
    )),
    functionKeywords: tokens.string(regex.choice(
        regex.word("fun"),
        regex.word("function")
    )),
    floats: tokens.float(regex.concat(
        regex.oneOrMore(regex.charIn("0-9")),
        regex.charFrom("."),
        regex.oneOrMore(regex.charIn("0-9"))
    ))
    
}

describe("Scanner", () => {

    const myScanner = new Scanner(defs)

    let streamText = ""

    it("handles empty strings", () => {
        const result = tokenize("")

        expect(result).to.be.empty
    })

    it("handles rubbish", () => {
        const [rubbish] = tokenize("~@#$%")

        expect(rubbish.tokenType).to.equal(tokens.error)
        expect(rubbish.lexeme).to.equal(streamText)
    })

    it("handles token types that recognizes once, and from first character", () => {
        const [plus] = tokenize("+")

        expect(plus.tokenType).to.equal(defs.arithmeticOperators)
        expect(plus.lexeme).to.equal(streamText)
    })

    it("handles token types that recognizes once, but not from first character", () => {
        const [arrow] = tokenize("<--")

        expect(arrow.tokenType).to.equal(defs.arrows)
        expect(arrow.lexeme).to.equal(streamText)

        const [badArrow, ..._] = tokenize("<=-")

        expect(badArrow.tokenType).to.equal(tokens.error)
        expect(badArrow.lexeme).to.equal("<")
    })

    it("handles token types that recognizes more than once, and from first character, consecutively", () => {
        const [zeroMargin] = tokenize("|")

        expect(zeroMargin.tokenType).to.equal(defs.margins)
        expect(zeroMargin.lexeme).to.equal(streamText)

        const [tightMargin] = tokenize("||")

        expect(tightMargin.tokenType).to.equal(defs.margins)
        expect(tightMargin.lexeme).to.equal(streamText)

        const [prefixMargin, ..._] = tokenize("|]")

        expect(prefixMargin.tokenType).to.equal(defs.margins)
        expect(prefixMargin.lexeme).to.equal("|")
    })

    it("handles token types that recognizes more than once, and from first character, not consecutively", () => {
        const [goodMargin] = tokenize("|...|")

        expect(goodMargin.tokenType).to.equal(defs.margins)
        expect(goodMargin.lexeme).to.equal(streamText)

        const [prefixMargin, ..._] = tokenize("|..]")

        expect(prefixMargin.tokenType).to.equal(defs.margins)
        expect(prefixMargin.lexeme).to.equal("|")
    })

    it("handles token types that recognizes more than once, but not from first character, consecutively", () => {
        const [shortestFloat] = tokenize("0.0")

        expect(shortestFloat.tokenType).to.equal(defs.floats)
        expect(shortestFloat.lexeme).to.equal(streamText)

        const [longFloat] = tokenize("123.456")

        expect(longFloat.tokenType).to.equal(defs.floats)
        expect(longFloat.lexeme).to.equal(streamText)

        const [badFloat, ..._1] = tokenize("123A")

        expect(badFloat.tokenType).to.equal(tokens.error)
        expect(badFloat.lexeme).to.equal("123")

        const [prefixFloat, ..._2] = tokenize("123.456A")

        expect(prefixFloat.tokenType).to.equal(defs.floats)
        expect(prefixFloat.lexeme).to.equal("123.456")    
    })

    it("handles token types that recognizes more than once, but not from first character, not consecutively", () => {
        const [shortFunction] = tokenize("fun")

        expect(shortFunction.tokenType).to.equal(defs.functionKeywords)
        expect(shortFunction.lexeme).to.equal(streamText)

        const [longFunction] = tokenize("function")

        expect(longFunction.tokenType).to.equal(defs.functionKeywords)
        expect(longFunction.lexeme).to.equal(streamText)

        const [badFunction, ..._1] = tokenize("fn")

        expect(badFunction.tokenType).to.equal(tokens.error)
        expect(badFunction.lexeme).to.equal("f")

        const [prefixFunction, ..._2] = tokenize("functor")

        expect(prefixFunction.tokenType).to.equal(defs.functionKeywords)
        expect(prefixFunction.lexeme).to.equal("fun")
    })

    it("handles rubbish followed by recognizable token", () => {
        const [rubbish, arrow] = tokenize("~@#$%<--")

        expect(rubbish.tokenType).to.equal(tokens.error)
        expect(rubbish.lexeme).to.equal("~@#$%")

        expect(arrow.tokenType).to.equal(defs.arrows)
        expect(arrow.lexeme).to.equal("<--")
    })

    it("handles rubbish followed by immediately recognizable token", () => {
        const [rubbish, margin] = tokenize("~@#$%|...|")

        expect(rubbish.tokenType).to.equal(tokens.error)
        expect(rubbish.lexeme).to.equal("~@#$%")

        expect(margin.tokenType).to.equal(defs.margins)
        expect(margin.lexeme).to.equal("|...|")
    })

    it("handles promising token followed by EOF", () => {
        const [incompleteFloat] = tokenize("123.")

        expect(incompleteFloat.tokenType).to.equal(tokens.error)
        expect(incompleteFloat.lexeme).to.equal("123.")
    })

    it("handles promising token followed by recognizable token", () => {
        const [incompleteFloat, arrow] = tokenize("123.<--")

        expect(incompleteFloat.tokenType).to.equal(tokens.error)
        expect(incompleteFloat.lexeme).to.equal("123.")

        expect(arrow.tokenType).to.equal(defs.arrows)
        expect(arrow.lexeme).to.equal("<--")
    })

    it("handles promising token followed by immediately recognizable token", () => {
        const [incompleteFunction, plus] = tokenize("fu+")

        expect(incompleteFunction.tokenType).to.equal(tokens.error)
        expect(incompleteFunction.lexeme).to.equal("fu")

        expect(plus.tokenType).to.equal(defs.arithmeticOperators)
        expect(plus.lexeme).to.equal("+")
    })

    it("handles recognizable and still matching token followed by EOF", () => {
        const [shortFunction, trail] = tokenize("funct")

        expect(shortFunction.tokenType).to.equal(defs.functionKeywords)
        expect(shortFunction.lexeme).to.equal("fun")
        
        expect(trail.tokenType).to.equal(tokens.error)
        expect(trail.lexeme).to.equal("ct")
    })

    it("handles recognizable and still matching token followed by recognizable token", () => {
        const [margin, trail, arrow] = tokenize("|...<--")

        expect(margin.tokenType).to.equal(defs.margins)
        expect(margin.lexeme).to.equal("|")

        expect(trail.tokenType).to.equal(tokens.error)
        expect(trail.lexeme).to.equal("...")

        expect(arrow.tokenType).to.equal(defs.arrows)
        expect(arrow.lexeme).to.equal("<--")
    })

    it("handles recognizable and still matching token followed by immediately recognizable token", () => {
        const [shortFunction, trail, plus] = tokenize("funct+")

        expect(shortFunction.tokenType).to.equal(defs.functionKeywords)
        expect(shortFunction.lexeme).to.equal("fun")

        expect(trail.tokenType).to.equal(tokens.error)
        expect(trail.lexeme).to.equal("ct")

        expect(plus.tokenType).to.equal(defs.arithmeticOperators)
        expect(plus.lexeme).to.equal("+")
    })

    function tokenize(text: string): tokens.Token<any>[] {
        streamText = text
        const stream = new streams.TextInputStream(text)
        const result: tokens.Token<any>[] = []
        for (const token of myScanner.iterator(stream)) {
            result.push(token)
        }
        expect(result.pop()?.tokenType).to.equal(tokens.eof)
        expect(result.map(t => t.lexeme).reduce((s1, s2) => s1 + s2, "")).to.equal(text)
        return result
    }
    
})

